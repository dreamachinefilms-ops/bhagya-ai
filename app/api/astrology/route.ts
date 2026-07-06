import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  getSavedBirthDetails,
  upsertBirthDetails,
} from "@/lib/backend/birthDetailsMemory";
import { saveAiExchange } from "@/lib/backend/chats";
import { buildConversationText } from "@/lib/backend/conversation";
import {
  badRequestResponse,
  rateLimitedResponse,
  safeErrorResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { validateAiRequestBody } from "@/lib/backend/validation";
import { buildAstrologyPrompt } from "@/lib/prokerala/buildAstrologyPrompt";
import {
  buildProkeralaDateTime,
  callProkeralaKundli,
} from "@/lib/prokerala/client";
import { extractBirthDetailsFromConversation } from "@/lib/prokerala/birthDetails";
import {
  resolveBirthPlace,
  type ResolvedLocation,
} from "@/lib/prokerala/locationResolver";
import {
  buildAstrologyMissingResponse,
  buildBirthPlaceUnresolvedResponse,
  buildProkeralaApiFailedResponse,
  buildProkeralaCredentialsMissingResponse,
} from "@/lib/guidanceResponses";

const routeName = "api/astrology";
type BirthDetailKey = "dateOfBirth" | "birthTime" | "birthPlace";

function getMissingBirthDetails({
  dateOfBirth,
  birthTime,
  birthPlace,
}: {
  dateOfBirth?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
}) {
  const missing: BirthDetailKey[] = [];

  if (!dateOfBirth) missing.push("dateOfBirth");
  if (!birthTime) missing.push("birthTime");
  if (!birthPlace) missing.push("birthPlace");

  return missing;
}

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
    latitude: Number(savedBirthDetails.latitude),
    longitude: Number(savedBirthDetails.longitude),
    timezoneOffset: savedBirthDetails.timezoneOffset,
  };
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

    const { chatId, service, question, messages, language, languageCode } =
      validation.value;

    const rate = checkRateLimit(user.id);

    if (!rate.allowed) {
      return rateLimitedResponse(languageCode);
    }

    const conversationText = buildConversationText(messages, question);
    const extractedBirthDetails =
      extractBirthDetailsFromConversation(conversationText);
    const savedBirthDetails = await getSavedBirthDetails({
      request,
      userId: user.id,
    });
    const birthDetails = {
      dateOfBirth:
        extractedBirthDetails.dateOfBirth ||
        savedBirthDetails?.dateOfBirth ||
        "",
      birthTime:
        extractedBirthDetails.birthTime || savedBirthDetails?.birthTime || "",
      birthPlace:
        extractedBirthDetails.birthPlace ||
        savedBirthDetails?.birthPlace ||
        "",
      isComplete: false,
      missing: [] as BirthDetailKey[],
    };
    const missing = getMissingBirthDetails(birthDetails);
    const isComplete = missing.length === 0;

    birthDetails.isComplete = isComplete;
    birthDetails.missing = missing;

    console.log("Birth details status:", {
      hasSavedDetails: Boolean(savedBirthDetails),
      extractedComplete: extractedBirthDetails.isComplete,
      mergedComplete: isComplete,
      missing,
    });

    if (!isComplete) {
      const answer = buildAstrologyMissingResponse(
        missing,
        languageCode
      );
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

    const extractedHasPlace = Boolean(extractedBirthDetails.birthPlace);
    const savedLocation = savedBirthDetails
      ? getSavedLocation(savedBirthDetails)
      : null;
    const location =
      resolveBirthPlace(birthDetails.birthPlace || "") ||
      (!extractedHasPlace ? savedLocation : null);

    if (!location) {
      const answer = buildBirthPlaceUnresolvedResponse(languageCode);
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

    await upsertBirthDetails({
      request,
      userId: user.id,
      dateOfBirth: birthDetails.dateOfBirth,
      birthTime: birthDetails.birthTime,
      birthPlace: location.name || birthDetails.birthPlace,
      latitude: location.latitude,
      longitude: location.longitude,
      timezoneOffset: location.timezoneOffset,
    });

    const datetime = buildProkeralaDateTime({
      dateOfBirth: birthDetails.dateOfBirth,
      birthTime: birthDetails.birthTime,
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

    const answer = await callBhagyaOpenAI({
      instructions: buildAstrologyPrompt({
        language,
        languageCode,
        conversationText,
        birthDetails,
        location,
        prokeralaData: kundliResult.data,
        usedSavedBirthDetails:
          Boolean(savedBirthDetails) && !extractedBirthDetails.isComplete,
      }),
      input: conversationText,
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
