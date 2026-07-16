import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  addChatMessage,
  findUserChat,
  listChatMessages,
  saveAiExchange,
} from "@/lib/backend/chats";
import {
  badRequestResponse,
  rateLimitedResponse,
} from "@/lib/backend/errors";
import { callGroundedBhagyaOpenAI } from "@/lib/guidance/generate";
import { findIncorrectNumerologyClaims } from "@/lib/guidance/groundingChecks";
import {
  finalizeGuidanceResponse,
  getFirstName,
  GUIDANCE_OUTPUT_LIMITS,
  resolveFirstNameForResponse,
} from "@/lib/guidance/promptCore";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { isUuid, validateAiRequestBody } from "@/lib/backend/validation";
import {
  NumerologyCalculationError,
  isValidTimeZone,
} from "@/lib/numerology/calculations";
import {
  createNumerologyBlueprint,
  parseNumerologyBlueprint,
  serializeNumerologyBlueprint,
} from "@/lib/numerology/messages";
import {
  logNumerologyStage,
  logNumerologySupabaseError,
} from "@/lib/numerology/logging";
import {
  NumerologyProfileError,
  NumerologyStorageError,
  getNumerologyProfile,
} from "@/lib/numerology/profileStore";
import {
  buildDeterministicCalculationAnswer,
  buildNumerologyEvidence,
  buildNumerologyPrompt,
  isCalculationExplanationRequest,
  selectNumerologyResponseDepth,
} from "@/lib/numerology/prompt";

const routeName = "api/numerology";
const allowedActions = new Set(["calculate-profile", "refresh-cycles", "chat"]);
const allowedLanguageCodes = new Set([
  "english", "hindi", "hinglish", "bengali", "marathi", "tamil", "telugu",
  "gujarati", "punjabi",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

class NumerologyRouteError extends Error {
  readonly code: "CHAT_NOT_FOUND" | "MESSAGE_SAVE_FAILED";
  readonly status: number;

  constructor(
    code: "CHAT_NOT_FOUND" | "MESSAGE_SAVE_FAILED",
    status: number,
  ) {
    super(code);
    this.name = "NumerologyRouteError";
    this.code = code;
    this.status = status;
  }
}

function apiError(status: number, error: string, message: string) {
  return NextResponse.json({ error, message, answer: message }, { status });
}

function getTimezone(body: Record<string, unknown>) {
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";

  if (!timezone || timezone.length > 100 || !isValidTimeZone(timezone)) {
    throw new NumerologyCalculationError("INVALID_TIMEZONE");
  }

  return timezone;
}

async function verifyNumerologyChat({
  request,
  userId,
  chatId,
}: {
  request: Request;
  userId: string;
  chatId: string;
}) {
  const supabase = createSupabaseUserClient(request);
  const chat = await findUserChat({ supabase, userId, chatId });

  if (!chat || chat.service !== "numerology") {
    throw new NumerologyRouteError("CHAT_NOT_FOUND", 404);
  }

  logNumerologyStage("chat verified", { service: "numerology" });

  return { supabase, chat };
}

async function saveOrUpdateBlueprint({
  request,
  userId,
  chatId,
  languageCode,
  content,
}: {
  request: Request;
  userId: string;
  chatId: string;
  languageCode: string;
  content: string;
}) {
  const { supabase } = await verifyNumerologyChat({ request, userId, chatId });
  const { data: existingMessages, error } = await supabase
    .from("messages")
    .select("id,chat_id,role,content,service,language_code,created_at")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: true });

  if (error) {
    logNumerologySupabaseError({
      stage: "blueprint message lookup failed",
      query:
        "messages.select(...).eq(chat_id,<verified-chat>).eq(user_id,<authenticated-user>).eq(role,assistant)",
      error,
    });
    throw new NumerologyRouteError("MESSAGE_SAVE_FAILED", 500);
  }

  const existing = (existingMessages || []).find(
    (message) =>
      typeof message.content === "string" &&
      Boolean(parseNumerologyBlueprint(message.content)),
  );

  if (!existing) {
    try {
      const message = await addChatMessage({
        request,
        userId,
        chatId,
        message: {
          role: "assistant",
          content,
          service: "numerology",
          languageCode,
        },
      });
      logNumerologyStage("assistant message saved", {
        messageType: "number-blueprint",
      });
      return message;
    } catch (saveError) {
      logNumerologySupabaseError({
        stage: "blueprint message insert failed",
        query: "messages.insert(<number-blueprint-message>)",
        error: saveError,
      });
      throw new NumerologyRouteError("MESSAGE_SAVE_FAILED", 500);
    }
  }

  if (existing.content === content) return existing;

  const { data: updated, error: updateError } = await supabase
    .from("messages")
    .update({ content, language_code: languageCode })
    .eq("id", existing.id)
    .eq("user_id", userId)
    .select("id,chat_id,role,content,service,language_code,created_at")
    .single();

  if (updateError) {
    logNumerologySupabaseError({
      stage: "blueprint message update failed",
      query:
        "messages.update(<number-blueprint-message>).eq(id,<existing-message>).eq(user_id,<authenticated-user>)",
      error: updateError,
    });
    throw new NumerologyRouteError("MESSAGE_SAVE_FAILED", 500);
  }
  logNumerologyStage("assistant message saved", {
    messageType: "number-blueprint",
    operation: "update",
  });
  return updated;
}

async function handleProfileAction({
  request,
  userId,
  body,
}: {
  request: Request;
  userId: string;
  body: Record<string, unknown>;
}) {
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  const languageCode =
    typeof body.languageCode === "string" && allowedLanguageCodes.has(body.languageCode)
      ? body.languageCode
      : "english";

  if (!isUuid(chatId)) return badRequestResponse("Invalid chat id.");

  const timezone = getTimezone(body);
  await verifyNumerologyChat({ request, userId, chatId });
  const result = await getNumerologyProfile({ request, userId, timezone });
  logNumerologyStage("profile ready", {
    cacheStatus: result.cacheStatus,
    fullNameSource: result.fullNameSource,
  });
  const content = serializeNumerologyBlueprint(result.profile, result.firstName);
  const message = await saveOrUpdateBlueprint({
    request,
    userId,
    chatId,
    languageCode,
    content,
  });

  let profileUpdatedMessage = null;

  if (result.cacheStatus === "updated") {
    try {
      profileUpdatedMessage = await addChatMessage({
        request,
        userId,
        chatId,
        message: {
          role: "assistant",
          content:
            "Your Number Blueprint has been refreshed because your saved birth profile or the calculation version changed. Future guidance in this conversation now uses the updated numbers.",
          service: "numerology",
          languageCode,
        },
      });
      logNumerologyStage("assistant message saved", {
        messageType: "profile-updated",
      });
    } catch (saveError) {
      logNumerologySupabaseError({
        stage: "profile updated message insert failed",
        query: "messages.insert(<profile-updated-message>)",
        error: saveError,
      });
      throw new NumerologyRouteError("MESSAGE_SAVE_FAILED", 500);
    }
  }

  return NextResponse.json({
    success: true,
    cacheStatus: result.cacheStatus,
    profile: createNumerologyBlueprint(result.profile, result.firstName),
    message,
    profileUpdatedMessage,
  });
}

async function buildServerHistory({
  request,
  userId,
  chatId,
}: {
  request: Request;
  userId: string;
  chatId: string;
}) {
  const messages = await listChatMessages({ request, userId, chatId });

  const historyMessages = messages
    .filter(
      (message) =>
        message.service === "numerology" &&
        typeof message.content === "string" &&
        !parseNumerologyBlueprint(message.content),
    )
    .slice(-18)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: String(message.content).slice(0, 3000),
    }));

  return {
    messages: historyMessages,
    text: historyMessages
    .map(
      (message) =>
        `${message.role === "assistant" ? "Bhagya" : "User"}: ${message.content}`,
    )
    .join("\n"),
  };
}

async function handleChat({
  request,
  userId,
  body,
}: {
  request: Request;
  userId: string;
  body: Record<string, unknown>;
}) {
  const validation = validateAiRequestBody({
    ...body,
    question:
      typeof body.question === "string" ? body.question : body.message,
  });
  if (!validation.ok) return badRequestResponse(validation.error);

  const { chatId, service, question, language, languageCode } = validation.value;
  if (service !== "numerology" || !chatId || !isUuid(chatId)) {
    return badRequestResponse("A valid Numerology chat is required.");
  }

  const rate = checkRateLimit(userId);
  if (!rate.allowed) return rateLimitedResponse(languageCode);

  const timezone = getTimezone(body);
  await verifyNumerologyChat({ request, userId, chatId });
  const [profileResult, history] = await Promise.all([
    getNumerologyProfile({ request, userId, timezone }),
    buildServerHistory({ request, userId, chatId }),
  ]);
  const { profile, firstName, fullName } = profileResult;
  const actualFirstName = getFirstName(fullName || firstName);
  const firstNameForResponse = resolveFirstNameForResponse({
    fullName,
    firstName,
    messages: history.messages,
    isInitialReading: !history.messages.some(
      (message) => message.role === "assistant",
    ),
    userMessage: question,
  });
  const depth = selectNumerologyResponseDepth(question);
  const evidence = buildNumerologyEvidence(profile, question);
  let answer: string;

  if (isCalculationExplanationRequest(question)) {
    answer = buildDeterministicCalculationAnswer(profile, question);
  } else {
    try {
      const prompt = buildNumerologyPrompt({
          profile,
          firstName: firstNameForResponse,
          language,
          languageCode,
          history: history.text,
          historyMessages: history.messages,
          question,
        });
      const rawAnswer = await callGroundedBhagyaOpenAI({
        instructions: prompt.instructions,
        input: question,
        maxOutputTokens: GUIDANCE_OUTPUT_LIMITS[prompt.depth],
        validate: (candidate) =>
          findIncorrectNumerologyClaims(candidate, profile),
      });
      answer = rawAnswer;
      logNumerologyStage("OpenAI request completed", { success: true });
    } catch (openAiError) {
      console.error("[numerology] OpenAI request failed", {
        errorName:
          openAiError instanceof Error ? openAiError.name : typeof openAiError,
        message:
          openAiError instanceof Error
            ? openAiError.message
            : "Unknown OpenAI failure",
      });
      return apiError(
        500,
        "INTERPRETATION_FAILED",
        "Your numbers are ready, but Bhagya could not complete the interpretation.",
      );
    }
  }
  answer = finalizeGuidanceResponse({
    answer,
    depth,
    evidence,
    history: history.messages,
    firstName: actualFirstName,
    fullName,
    allowJi: /\b(?:call|address)\b.{0,30}\bji\b/i.test(question),
  });
  const saved = await saveAiExchange({
    request,
    routeName,
    userId,
    chatId,
    service,
    languageCode,
    question,
    answer,
  });
  const persistenceDelegated =
    request.headers.get("x-bhagya-skip-persistence") === "true";
  logNumerologyStage("user message saved", {
    savedByNumerologyRoute: saved.saved,
    delegatedToSharedChatRoute: persistenceDelegated,
  });
  logNumerologyStage("assistant message saved", {
    savedByNumerologyRoute: saved.saved,
    delegatedToSharedChatRoute: persistenceDelegated,
    messageType: "interpretation",
  });

  if (!persistenceDelegated && !saved.saved) {
    return apiError(
      500,
      "MESSAGE_SAVE_FAILED",
      "Your Numerology message could not be saved. Please try again.",
    );
  }

  return NextResponse.json({ answer, ...saved });
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);

  if (authError || !user) {
    return apiError(
      401,
      "AUTH_REQUIRED",
      "Your session has expired. Please sign in again.",
    );
  }
  logNumerologyStage("authenticated", { authenticated: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Invalid JSON body.");
  }

  if (!isRecord(body)) return badRequestResponse("Invalid request body.");
  const action = typeof body.action === "string" ? body.action : "chat";
  if (!allowedActions.has(action)) return badRequestResponse("Invalid Numerology action.");

  try {
    return action === "chat"
      ? await handleChat({ request, userId: user.id, body })
      : await handleProfileAction({ request, userId: user.id, body });
  } catch (error) {
    if (error instanceof NumerologyProfileError) {
      return apiError(
        400,
        "BIRTH_PROFILE_INCOMPLETE",
        "Complete your full name and date of birth to create your Numerology profile.",
      );
    }

    if (error instanceof NumerologyStorageError) {
      if (error.code === "PROFILE_SAVE_FAILED") {
        return apiError(
          500,
          "PROFILE_SAVE_FAILED",
          "Your numbers were calculated, but the profile could not be saved.",
        );
      }

      return apiError(
        500,
        error.code,
        error.code === "BIRTH_PROFILE_LOAD_FAILED"
          ? "Your birth profile could not be loaded. Please try again."
          : "Your saved Numerology profile could not be loaded. Please try again.",
      );
    }

    if (error instanceof NumerologyCalculationError) {
      if (error.code !== "INVALID_TIMEZONE") {
        console.error("[numerology] calculation failed", { code: error.code });
        return apiError(
          500,
          "CALCULATION_FAILED",
          "Bhagya could not calculate your Numerology profile.",
        );
      }

      return apiError(
        400,
        "INVALID_TIMEZONE",
        "Your device timezone could not be validated. Please try again.",
      );
    }

    if (error instanceof NumerologyRouteError) {
      return apiError(
        error.status,
        error.code,
        error.code === "CHAT_NOT_FOUND"
          ? "The Numerology conversation could not be found."
          : "Your Numerology message could not be saved. Please try again.",
      );
    }

    console.error("[numerology] unexpected route failure", {
      route: routeName,
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return apiError(
      500,
      "NUMEROLOGY_FAILED",
      "Bhagya could not load your Numerology profile. Please try again.",
    );
  }
}
