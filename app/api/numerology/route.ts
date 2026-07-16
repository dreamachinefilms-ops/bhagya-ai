import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  addChatMessage,
  getUserChat,
  listChatMessages,
  saveAiExchange,
} from "@/lib/backend/chats";
import {
  badRequestResponse,
  rateLimitedResponse,
  safeErrorResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
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
  NumerologyProfileError,
  getNumerologyProfile,
} from "@/lib/numerology/profileStore";
import {
  buildDeterministicCalculationAnswer,
  buildNumerologyPrompt,
  isCalculationExplanationRequest,
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

function apiError(status: number, error: string, answer: string) {
  return NextResponse.json({ error, answer }, { status });
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
  const chat = await getUserChat({ supabase, userId, chatId });

  if (chat.service !== "numerology") {
    throw new Error("NUMEROLOGY_CHAT_REQUIRED");
  }

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

  if (error) throw error;

  const existing = (existingMessages || []).find(
    (message) =>
      typeof message.content === "string" &&
      Boolean(parseNumerologyBlueprint(message.content)),
  );

  if (!existing) {
    return addChatMessage({
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
  }

  if (existing.content === content) return existing;

  const { data: updated, error: updateError } = await supabase
    .from("messages")
    .update({ content, language_code: languageCode })
    .eq("id", existing.id)
    .eq("user_id", userId)
    .select("id,chat_id,role,content,service,language_code,created_at")
    .single();

  if (updateError) throw updateError;
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
  const content = serializeNumerologyBlueprint(result.profile, result.firstName);
  const message = await saveOrUpdateBlueprint({
    request,
    userId,
    chatId,
    languageCode,
    content,
  });

  const profileUpdatedMessage =
    result.cacheStatus === "updated"
      ? await addChatMessage({
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
        })
      : null;

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

  return messages
    .filter(
      (message) =>
        typeof message.content === "string" &&
        !parseNumerologyBlueprint(message.content),
    )
    .slice(-12)
    .map(
      (message) =>
        `${message.role === "assistant" ? "Bhagya" : "User"}: ${String(message.content).slice(0, 3000)}`,
    )
    .join("\n");
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
  const [{ profile, firstName }, history] = await Promise.all([
    getNumerologyProfile({ request, userId, timezone }),
    buildServerHistory({ request, userId, chatId }),
  ]);
  let answer: string;

  if (isCalculationExplanationRequest(question)) {
    answer = buildDeterministicCalculationAnswer(profile, question);
  } else {
    try {
      answer = await callBhagyaOpenAI({
        instructions: buildNumerologyPrompt({
          profile,
          firstName,
          language,
          languageCode,
          history,
          question,
        }),
        input: question,
      });
    } catch {
      return apiError(
        502,
        "INTERPRETATION_FAILED",
        "Your numbers are saved, but Bhagya could not complete the interpretation. Please try again.",
      );
    }
  }
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

  return NextResponse.json({ answer, ...saved });
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);

  if (authError || !user) {
    return apiError(401, "UNAUTHORIZED", "Please login to continue.");
  }

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
        428,
        error.code,
        error.code === "NAME_REQUIRED"
          ? "Add your full name to your birth profile to create your Number Blueprint."
          : "Add your date of birth to your birth profile to create your Number Blueprint.",
      );
    }

    if (error instanceof NumerologyCalculationError) {
      return apiError(
        400,
        error.code,
        error.code === "INVALID_TIMEZONE"
          ? "Your device timezone could not be validated. Please try again."
          : "Your saved name or date of birth could not be used for Numerology.",
      );
    }

    if (error instanceof Error && error.message === "NUMEROLOGY_CHAT_REQUIRED") {
      return apiError(400, "INVALID_CHAT", "This conversation is not a Numerology chat.");
    }

    return safeErrorResponse(error, routeName, user.id);
  }
}
