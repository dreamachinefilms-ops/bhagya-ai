import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  getSavedBirthDetails,
  getSavedUserProfile,
  isCompleteBirthDetails,
  upsertBirthDetails,
} from "@/lib/backend/birthDetailsMemory";
import { listChatMessages, saveAiExchange } from "@/lib/backend/chats";
import {
  buildConversationText,
  sanitizeMessages,
} from "@/lib/backend/conversation";
import {
  badRequestResponse,
  rateLimitedResponse,
  safeErrorResponse,
} from "@/lib/backend/errors";
import { callGroundedBhagyaOpenAI } from "@/lib/guidance/generate";
import { findUnsupportedUnknownTimeAstrologyClaims } from "@/lib/guidance/groundingChecks";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { validateAiRequestBody } from "@/lib/backend/validation";
import { buildAstrologyPrompt } from "@/lib/astrology/prompt";
import {
  finalizeGuidanceResponse,
  GUIDANCE_OUTPUT_LIMITS,
  resolveFirstNameForResponse,
  selectGuidanceResponseDepth,
} from "@/lib/guidance/promptCore";
import {
  buildProkeralaDateTime,
  callProkeralaKundli,
} from "@/lib/prokerala/client";
import {
  resolveBirthPlace,
  type ResolvedLocation,
} from "@/lib/prokerala/locationResolver";
import {
  buildProkeralaApiFailedResponse,
  buildProkeralaCredentialsMissingResponse,
} from "@/lib/guidanceResponses";
import { getOrCreateUserPreferences } from "@/lib/backend/userPreferences";
import { getUserFirstName, preferenceToResponseDepth } from "@/lib/userPreferences";

const routeName = "api/astrology";
type BirthDetailKey = "dateOfBirth" | "birthTime" | "birthPlace";

function getSavedLocation(savedBirthDetails: {
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
}): ResolvedLocation | null {
  if (
    !savedBirthDetails.birthPlace ||
    !Number.isFinite(savedBirthDetails.latitude) ||
    !Number.isFinite(savedBirthDetails.longitude) ||
    !savedBirthDetails.timezoneOffset
  ) {
    return null;
  }

  return {
    name: savedBirthDetails.birthPlace,
    displayName: savedBirthDetails.birthPlace,
    latitude: Number(savedBirthDetails.latitude),
    longitude: Number(savedBirthDetails.longitude),
    timezoneOffset: savedBirthDetails.timezoneOffset,
  };
}

function birthDetailsRequiredResponse() {
  return NextResponse.json(
    {
      code: "BIRTH_DETAILS_REQUIRED",
      answer: "Please complete your birth profile before continuing.",
    },
    { status: 428 }
  );
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);

  if (authError || !user) {
    return NextResponse.json(
      {
        answer: "Please login to continue.",
        error: "UNAUTHORIZED",
      },
      { status: 401 }
    );
  }

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body.");
    }

    const validation = validateAiRequestBody(body);

    if (!validation.ok) {
      return badRequestResponse(validation.error);
    }

    const { chatId, service, question, messages, languageCode } =
      validation.value;

    const rate = checkRateLimit(user.id);

    if (!rate.allowed) {
      return rateLimitedResponse(languageCode);
    }

    const [savedProfile, savedBirthDetails, preferences, storedMessages] = await Promise.all([
      getSavedUserProfile({ request, userId: user.id }),
      getSavedBirthDetails({
        request,
        userId: user.id,
      }),
      getOrCreateUserPreferences({ request, userId: user.id }),
      chatId
        ? listChatMessages({ request, userId: user.id, chatId })
        : Promise.resolve(messages),
    ]);
    const contextualMessages = preferences.useChatPersonalization ? storedMessages : messages;
    const cleanHistory = sanitizeMessages(contextualMessages, {
      service: "astrology",
      limit: 18,
    });
    const historyMessages = cleanHistory.map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content,
    }));
    const conversationText = buildConversationText(contextualMessages, question, {
      service: "astrology",
      limit: 18,
    });

    if (!isCompleteBirthDetails(savedBirthDetails)) {
      return birthDetailsRequiredResponse();
    }

    const birthTimeKnown = savedBirthDetails?.birthTimeKnown !== false;
    const calculationBirthTime = birthTimeKnown
      ? savedBirthDetails?.birthTime || ""
      : "12:00";
    const birthDetails = {
      dateOfBirth: savedBirthDetails?.dateOfBirth || "",
      birthTime: birthTimeKnown ? savedBirthDetails?.birthTime || "" : null,
      birthTimeKnown,
      birthTimeAccuracy: birthTimeKnown
        ? ("known" as const)
        : ("unknown" as const),
      calculationFallbackTime: birthTimeKnown ? undefined : "12:00",
      birthPlace: savedBirthDetails?.birthPlace || "",
      isComplete: true,
      missing: [] as BirthDetailKey[],
    };
    const savedLocation = savedBirthDetails
      ? getSavedLocation(savedBirthDetails)
      : null;
    const location =
      savedLocation || resolveBirthPlace(savedBirthDetails?.birthPlace || "");

    if (!location) {
      return birthDetailsRequiredResponse();
    }

    if (!savedLocation) {
      await upsertBirthDetails({
        request,
        userId: user.id,
        dateOfBirth: birthDetails.dateOfBirth,
        birthTime: birthTimeKnown ? calculationBirthTime : null,
        birthTimeKnown,
        birthPlace: location.displayName || location.name || birthDetails.birthPlace,
        latitude: location.latitude,
        longitude: location.longitude,
        timezoneOffset: location.timezoneOffset,
      });
    }

    const datetime = buildProkeralaDateTime({
      dateOfBirth: birthDetails.dateOfBirth,
      birthTime: calculationBirthTime,
      timezoneOffset: location.timezoneOffset,
    });
    const kundliResult = await callProkeralaKundli({ datetime, location });

    if (!kundliResult.ok) {
      const answer =
        kundliResult.error === "missing_credentials"
          ? buildProkeralaCredentialsMissingResponse(languageCode)
          : buildProkeralaApiFailedResponse(languageCode);
      const saved = await saveAiExchange({
        request,
        routeName,
        userId: user.id,
        chatId,
        service,
        languageCode,
        question,
        answer,
      });

      return NextResponse.json({ answer, ...saved });
    }

    const actualFirstName = getUserFirstName({ preferredFirstName: savedProfile?.firstName, fullName: savedProfile?.fullName });
    const firstNameForResponse = resolveFirstNameForResponse({
      fullName: savedProfile?.fullName,
      firstName: savedProfile?.firstName,
      messages: historyMessages,
      isInitialReading: !historyMessages.some(
        (message) => message.role === "assistant",
      ),
      userMessage: question,
    });
    const responseDepth = preferenceToResponseDepth(preferences.responseDetail, question) || selectGuidanceResponseDepth(question);
    const effectiveLanguageCode = preferences.language === "hi" ? "hindi" : "english";
    const effectiveLanguage = preferences.language === "hi" ? "Hindi" : "English";
    const prompt = buildAstrologyPrompt({
        language: effectiveLanguage,
        languageCode: effectiveLanguageCode,
        conversationText,
        historyMessages,
        currentQuestion: question,
        birthDetails,
        location,
        prokeralaData: kundliResult.data,
        firstName: firstNameForResponse,
        responseDepth,
      });
    const rawAnswer = await callGroundedBhagyaOpenAI({
      instructions: prompt.instructions,
      input: conversationText,
      maxOutputTokens: GUIDANCE_OUTPUT_LIMITS[responseDepth],
      validate: (candidate) =>
        findUnsupportedUnknownTimeAstrologyClaims(
          candidate,
          birthTimeKnown,
        ),
    });
    const answer = finalizeGuidanceResponse({
      answer: rawAnswer,
      depth: responseDepth,
      evidence: prompt.evidence,
      history: historyMessages,
      firstName: actualFirstName,
      fullName: savedProfile?.fullName,
      allowJi: /\b(?:call|address)\b.{0,30}\bji\b/i.test(question),
    });
    const saved = await saveAiExchange({
      request,
      routeName,
      userId: user.id,
      chatId,
      service,
      languageCode,
      question,
      answer,
    });

    return NextResponse.json({ answer, ...saved });
  } catch (error) {
    return safeErrorResponse(error, routeName, user.id);
  }
}
