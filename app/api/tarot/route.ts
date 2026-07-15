import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { getSavedUserProfile } from "@/lib/backend/birthDetailsMemory";
import { findUserChat, saveAiExchange } from "@/lib/backend/chats";
import { buildConversationText } from "@/lib/backend/conversation";
import {
  badRequestResponse,
  rateLimitedResponse,
  safeErrorResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { isUuid, validateAiRequestBody } from "@/lib/backend/validation";
import { getTarotCard, tarotDeck } from "@/lib/tarot/deck";
import {
  buildDrawnCard,
  buildTarotFollowUpPrompt,
  buildTarotInitialPrompt,
  getTarotSpread,
  isTarotSpreadType,
  type DrawnTarotCard,
  type TarotReadingSummary,
  type TarotSpreadType,
} from "@/lib/tarot/reading";

const routeName = "api/tarot";
const reversalProbability = 0.25;
const sessionTtlMs = 20 * 60 * 1000;
const availableCardCounts: Record<TarotSpreadType, number> = {
  "one-card": 10,
  "three-card": 15,
};

function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: code, code, message },
    { status }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function devLog(event: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[tarot] ${event}`, details);
}

function getSupabaseErrorInfo(error: unknown) {
  if (!isRecord(error)) {
    return {
      code: undefined,
      message: error instanceof Error ? error.message : String(error),
      details: undefined,
    };
  }

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    message: typeof error.message === "string" ? error.message : undefined,
    details: typeof error.details === "string" ? error.details : undefined,
  };
}

function getTarotDatabaseErrorResponse(error: unknown) {
  const info = getSupabaseErrorInfo(error);

  if (info.code === "42P01") {
    return apiError(
      500,
      "TAROT_TABLE_MISSING",
      "The Tarot database tables are missing. Please run the Tarot Supabase migration."
    );
  }

  if (info.code === "42703" || info.code === "PGRST204") {
    return apiError(
      500,
      "TAROT_SCHEMA_MISMATCH",
      "The Tarot database schema is out of date. Please run the latest Tarot migration."
    );
  }

  if (info.code === "42501") {
    return apiError(
      403,
      "TAROT_RLS_BLOCKED",
      "The Tarot session could not be saved because database permissions are not configured."
    );
  }

  if (info.code === "23503") {
    return apiError(
      400,
      "CHAT_NOT_FOUND",
      "The Tarot conversation could not be created."
    );
  }

  return apiError(
    500,
    "DATABASE_ERROR",
    "The cards could not be prepared. Please try again."
  );
}

function sanitizeQuestion(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1200) : "";
}

function secureShuffle<T>(items: T[]) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function secureOrientation() {
  return randomInt(100) < reversalProbability * 100 ? "reversed" : "upright";
}

function validateSelectedIndexes({
  selectedIndexes,
  requiredCount,
  availablePositions,
}: {
  selectedIndexes: unknown;
  requiredCount: number;
  availablePositions: number;
}) {
  if (!Array.isArray(selectedIndexes)) {
    return { ok: false as const, error: "Please select the required number of cards." };
  }

  const indexes = selectedIndexes
    .map((index) => (typeof index === "number" ? index : Number.NaN))
    .filter((index) => Number.isInteger(index));
  const uniqueIndexes = [...new Set(indexes)];

  if (indexes.length !== uniqueIndexes.length) {
    return { ok: false as const, error: "Please select each card only once." };
  }

  if (uniqueIndexes.length !== requiredCount) {
    return { ok: false as const, error: "Please select the required number of cards." };
  }

  if (
    uniqueIndexes.some(
      (index) => index < 0 || index >= availablePositions
    )
  ) {
    return { ok: false as const, error: "Invalid card selection." };
  }

  return { ok: true as const, indexes: uniqueIndexes };
}

function buildTarotMessageContent(reading: TarotReadingSummary) {
  return JSON.stringify({
    type: "bhagya.tarot",
    service: "tarot",
    ...reading,
  });
}

async function getLatestTarotReading({
  request,
  userId,
  chatId,
}: {
  request: Request;
  userId: string;
  chatId?: string;
}) {
  if (!chatId || !isUuid(chatId)) return null;

  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase
    .from("tarot_readings")
    .select("id,question,spread_type,spread_name,cards,interpretation")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    readingId: data.id as string,
    question: data.question as string,
    spreadType: data.spread_type as TarotSpreadType,
    spreadName: data.spread_name as string,
    cards: Array.isArray(data.cards) ? (data.cards as DrawnTarotCard[]) : [],
    interpretation: typeof data.interpretation === "string" ? data.interpretation : "",
  };
}

async function handleStartSession({
  request,
  userId,
  body,
}: {
  request: Request;
  userId: string;
  body: Record<string, unknown>;
}) {
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  const question = sanitizeQuestion(body.question);
  const spreadType = body.spreadType;
  const language =
    typeof body.language === "string" && body.language.trim()
      ? body.language.trim().slice(0, 40)
      : "English";
  const languageCode =
    typeof body.languageCode === "string" && body.languageCode.trim()
      ? body.languageCode.trim().slice(0, 40)
      : "english";

  devLog("start-session request", {
    routeName,
    authenticatedUserPresent: Boolean(userId),
    chatIdPresent: Boolean(chatId),
    spreadType,
    questionLength: question.length,
  });

  if (!isUuid(chatId)) {
    return apiError(400, "INVALID_CHAT", "The Tarot conversation could not be created.");
  }

  if (!question) {
    return apiError(400, "MISSING_QUESTION", "Please ask the cards a question first.");
  }

  if (!isTarotSpreadType(spreadType)) {
    return apiError(400, "INVALID_SPREAD_TYPE", "Please choose a valid Tarot spread.");
  }

  const supabase = createSupabaseUserClient(request);
  let chat: Awaited<ReturnType<typeof findUserChat>>;

  try {
    chat = await findUserChat({ supabase, userId, chatId });
  } catch (error) {
    const info = getSupabaseErrorInfo(error);
    devLog("chat ownership check failed", {
      routeName,
      chatIdPresent: Boolean(chatId),
      supabaseErrorCode: info.code,
      supabaseErrorMessage: info.message,
      httpStatus: 500,
    });
    throw error;
  }

  if (!chat) {
    devLog("chat ownership check rejected", {
      routeName,
      chatIdPresent: Boolean(chatId),
      httpStatus: 404,
    });
    return apiError(404, "CHAT_NOT_FOUND", "The Tarot conversation could not be created.");
  }

  if (chat.service !== "tarot") {
    devLog("chat service mismatch", {
      routeName,
      chatIdPresent: Boolean(chatId),
      chatService: chat.service,
      httpStatus: 400,
    });
    return apiError(400, "INVALID_CHAT_SERVICE", "The Tarot conversation could not be created.");
  }

  const spread = getTarotSpread({ spreadType, question });
  const shuffledCardIds = secureShuffle(tarotDeck.map((card) => card.id));
  const { data, error } = await supabase
    .from("tarot_sessions")
    .insert({
      user_id: userId,
      chat_id: chatId,
      question,
      spread_type: spreadType,
      spread_name: spread.spreadName,
      language,
      language_code: languageCode,
      spread_positions: spread.positions,
      shuffled_card_ids: shuffledCardIds,
      expires_at: new Date(Date.now() + sessionTtlMs).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    const info = getSupabaseErrorInfo(error);
    devLog("session insert failed", {
      routeName,
      chatIdPresent: Boolean(chatId),
      spreadType,
      questionLength: question.length,
      supabaseErrorCode: info.code,
      supabaseErrorMessage: info.message,
      httpStatus: info.code === "42501" ? 403 : 500,
      tarotSessionInsertSucceeded: false,
    });
    console.error("[tarot] session insert failed", {
      code: info.code,
      message: info.message,
      details: info.details,
    });
    return getTarotDatabaseErrorResponse(error);
  }

  devLog("session insert succeeded", {
    routeName,
    chatIdPresent: Boolean(chatId),
    spreadType,
    questionLength: question.length,
    httpStatus: 200,
    tarotSessionInsertSucceeded: true,
  });

  return NextResponse.json({
    success: true,
    readingSessionId: data.id,
    selectionCount: spread.positions.length,
    availablePositions: Array.from(
      { length: availableCardCounts[spreadType] },
      (_, index) => index
    ),
    spreadPositions: spread.positions,
    spreadName: spread.spreadName,
  });
}

async function handleReveal({
  request,
  userId,
  body,
}: {
  request: Request;
  userId: string;
  body: Record<string, unknown>;
}) {
  const readingSessionId =
    typeof body.readingSessionId === "string" ? body.readingSessionId : "";

  if (!isUuid(readingSessionId)) {
    return apiError(400, "INVALID_SESSION", "This card-selection session has expired. Please shuffle again.");
  }

  const supabase = createSupabaseUserClient(request);
  const { data: session, error: sessionError } = await supabase
    .from("tarot_sessions")
    .select("id,user_id,chat_id,question,spread_type,spread_name,language,language_code,spread_positions,shuffled_card_ids,status,expires_at")
    .eq("id", readingSessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sessionError || !session) {
    return apiError(404, "SESSION_NOT_FOUND", "This card-selection session has expired. Please shuffle again.");
  }

  if (session.status !== "selecting") {
    return apiError(409, "SESSION_ALREADY_REVEALED", "These cards have already been revealed.");
  }

  if (new Date(String(session.expires_at)).getTime() < Date.now()) {
    await supabase
      .from("tarot_sessions")
      .update({ status: "expired" })
      .eq("id", readingSessionId)
      .eq("user_id", userId);

    return apiError(410, "SESSION_EXPIRED", "This card-selection session has expired. Please shuffle again.");
  }

  const spreadType = session.spread_type as TarotSpreadType;
  const spreadPositions = Array.isArray(session.spread_positions)
    ? (session.spread_positions as string[])
    : [];
  const availablePositions = availableCardCounts[spreadType];
  const selected = validateSelectedIndexes({
    selectedIndexes: body.selectedIndexes,
    requiredCount: spreadPositions.length,
    availablePositions,
  });

  if (!selected.ok) {
    return apiError(400, "INVALID_SELECTION", selected.error);
  }

  const shuffledCardIds = Array.isArray(session.shuffled_card_ids)
    ? (session.shuffled_card_ids as string[])
    : [];
  const drawnCards = selected.indexes.map((selectionIndex, index) => {
    const card = getTarotCard(shuffledCardIds[selectionIndex]);

    if (!card) throw new Error("MISSING_CARD_DATA");

    return buildDrawnCard({
      card,
      orientation: secureOrientation(),
      position: spreadPositions[index],
      selectionIndex,
    });
  });
  const conversationText = `User: ${session.question}`;
  const profile = await getSavedUserProfile({ request, userId }).catch(() => null);
  let interpretation = "";
  let status = "complete";

  try {
    interpretation = await callBhagyaOpenAI({
      instructions: buildTarotInitialPrompt({
        language: String(session.language || "English"),
        languageCode: String(session.language_code || "english"),
        firstName: profile?.firstName || undefined,
        question: String(session.question),
        spreadType,
        spreadName: String(session.spread_name),
        cards: drawnCards,
        conversationText,
      }),
      input: conversationText,
    });
  } catch (error) {
    console.error("[tarot] OpenAI interpretation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    interpretation =
      "Your cards are saved, but Bhagya could not complete the interpretation. Try the interpretation again.";
    status = "interpretation_failed";
  }

  const { data: reading, error: readingError } = await supabase
    .from("tarot_readings")
    .insert({
      user_id: userId,
      chat_id: session.chat_id,
      question: session.question,
      spread_type: spreadType,
      spread_name: session.spread_name,
      language_code: session.language_code,
      cards: drawnCards,
      interpretation,
      status,
    })
    .select("id")
    .single();

  if (readingError) {
    console.error("[tarot] reading insert failed", { message: readingError.message });
    return apiError(500, "DATABASE_ERROR", "The cards could not be saved. Please try again.");
  }

  const readingSummary: TarotReadingSummary = {
    readingId: reading.id as string,
    question: String(session.question),
    spreadType,
    spreadName: String(session.spread_name),
    cards: drawnCards,
    interpretation,
  };
  const messageContent = buildTarotMessageContent(readingSummary);
  const { error: messageError } = await supabase.from("messages").insert([
    {
      chat_id: session.chat_id,
      user_id: userId,
      role: "user",
      content: String(session.question),
      service: "tarot",
      language_code: session.language_code,
    },
    {
      chat_id: session.chat_id,
      user_id: userId,
      role: "assistant",
      content: messageContent,
      service: "tarot",
      language_code: session.language_code,
    },
  ]);

  if (messageError) {
    console.error("[tarot] message insert failed", { message: messageError.message });
    return apiError(500, "DATABASE_ERROR", "The reading was created but could not be saved in chat.");
  }

  await supabase
    .from("tarot_sessions")
    .update({ status: "revealed", selected_indexes: selected.indexes })
    .eq("id", readingSessionId)
    .eq("user_id", userId);
  await supabase
    .from("chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", session.chat_id)
    .eq("user_id", userId);

  return NextResponse.json({
    success: true,
    readingId: reading.id,
    question: session.question,
    spreadType,
    spreadName: session.spread_name,
    cards: drawnCards,
    reading: interpretation,
    messageContent,
  });
}

async function handleFollowUp(request: Request, userId: string, body: unknown) {
  const validation = validateAiRequestBody(body);

  if (!validation.ok) {
    return badRequestResponse(validation.error);
  }

  const { chatId, service, question, messages, language, languageCode } =
    validation.value;
  const rate = checkRateLimit(userId);

  if (!rate.allowed) {
    return rateLimitedResponse(languageCode);
  }

  const conversationText = buildConversationText(messages, question);
  const reading = await getLatestTarotReading({ request, userId, chatId });

  if (!reading) {
    const answer =
      "Ask your question and choose a one-card or three-card spread so I can draw the Tarot properly.";
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

  const profile = await getSavedUserProfile({ request, userId }).catch(() => null);
  const answer = await callBhagyaOpenAI({
    instructions: buildTarotFollowUpPrompt({
      language,
      languageCode,
      firstName: profile?.firstName || undefined,
      question,
      reading,
      conversationText,
    }),
    input: conversationText,
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

  return NextResponse.json({ answer, ...saved });
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);

  if (authError || !user) {
    return apiError(
      401,
      "AUTH_REQUIRED",
      "Your session has expired. Please sign in again."
    );
  }

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body.");
    }

    if (isRecord(body) && body.action === "start-session") {
      return await handleStartSession({ request, userId: user.id, body });
    }

    if (isRecord(body) && body.action === "reveal") {
      return await handleReveal({ request, userId: user.id, body });
    }

    return await handleFollowUp(request, user.id, body);
  } catch (error) {
    return safeErrorResponse(error, routeName, user.id);
  }
}
