import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { getSavedUserProfile } from "@/lib/backend/birthDetailsMemory";
import { getOrCreateUserPreferences } from "@/lib/backend/userPreferences";
import { getUserFirstName, preferenceToResponseDepth } from "@/lib/userPreferences";
import {
  findUserChat,
  listChatMessages,
  saveAiExchange,
} from "@/lib/backend/chats";
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
import { findUnsupportedTarotCards } from "@/lib/guidance/groundingChecks";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { isUuid, validateAiRequestBody } from "@/lib/backend/validation";
import { getTarotCard, tarotDeck } from "@/lib/tarot/deck";
import {
  buildDrawnCard,
  getTarotSpread,
  isTarotSpreadType,
  type DrawnTarotCard,
  type TarotReadingSummary,
  type TarotSpreadType,
} from "@/lib/tarot/reading";
import {
  buildTarotFollowUpPrompt,
  buildTarotInitialPrompt,
} from "@/lib/tarot/prompt";
import {
  finalizeGuidanceResponse,
  GUIDANCE_OUTPUT_LIMITS,
  resolveFirstNameForResponse,
} from "@/lib/guidance/promptCore";

const routeName = "api/tarot";
const reversalProbability = 0.25;
const sessionTtlMs = 30 * 60 * 1000;
const availableCardCounts: Record<TarotSpreadType, number> = {
  "one-card": 78,
  "three-card": 78,
};

function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: code, code, message },
    { status }
  );
}

function invalidRequest(message = "Please enter a question and choose a reading type.") {
  return apiError(400, "INVALID_REQUEST", message);
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
      hint: undefined,
    };
  }

  return {
    code: typeof error.code === "string" ? error.code : undefined,
    message: typeof error.message === "string" ? error.message : undefined,
    details: typeof error.details === "string" ? error.details : undefined,
    hint: typeof error.hint === "string" ? error.hint : undefined,
  };
}

function getTarotDatabaseErrorResponse(error: unknown) {
  const info = getSupabaseErrorInfo(error);

  if (info.code === "42P01" || info.code === "42703" || info.code === "PGRST204") {
    return apiError(
      503,
      "TAROT_STORAGE_NOT_CONFIGURED",
      "Tarot storage is not configured yet."
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
    "SESSION_CREATE_FAILED",
    "The cards could not be prepared. Please try again."
  );
}

function sanitizeQuestion(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1200) : "";
}

function validateTarotDeck(): void {
  if (tarotDeck.length !== 78) {
    throw new Error(`Invalid Tarot deck size: ${tarotDeck.length}`);
  }

  const ids = tarotDeck.map((card) => card.id);

  if (new Set(ids).size !== ids.length) {
    throw new Error("Tarot deck contains duplicate card IDs.");
  }
}

function secureShuffle<T>(items: readonly T[]) {
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
    return invalidRequest("The Tarot conversation could not be created.");
  }

  if (!question) {
    return invalidRequest();
  }

  if (!isTarotSpreadType(spreadType)) {
    return invalidRequest();
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

  validateTarotDeck();
  const spread = getTarotSpread({ spreadType, question });
  const shuffledCardIds = secureShuffle(tarotDeck.map((card) => card.id));
  devLog("secure deck generated", {
    routeName,
    deckSize: tarotDeck.length,
    uniqueCardIds: new Set(shuffledCardIds).size,
  });
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
  const sessionPayload = {
    user_id: userId,
    chat_id: chat.id as string,
    question,
    spread_type: spreadType,
    spread_name: spread.spreadName,
    language,
    language_code: languageCode,
    spread_positions: spread.positions,
    shuffled_card_ids: shuffledCardIds,
    selected_indexes: null,
    status: "selecting",
    expires_at: expiresAt,
  };

  devLog("session insert attempted", {
    routeName,
    chatIdPresent: Boolean(chat.id),
    spreadType,
    questionLength: question.length,
    tarotSessionInsertAttempted: true,
  });

  const { data, error } = await supabase
    .from("tarot_sessions")
    .insert(sessionPayload)
    .select("id, spread_type, spread_positions, expires_at")
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
      supabaseErrorDetails: info.details,
      supabaseErrorHint: info.hint,
      httpStatus: info.code === "42501" ? 403 : 500,
      tarotSessionInsertSucceeded: false,
    });
    console.error("[tarot] session insert failed", {
      code: info.code,
      message: info.message,
      details: info.details,
      hint: info.hint,
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
    availablePositions: availableCardCounts[spreadType],
    spreadPositions: spread.positions,
    spreadType,
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
  const historyMessages = [
    { role: "user" as const, content: String(session.question) },
  ];
  const [profile, preferences] = await Promise.all([
    getSavedUserProfile({ request, userId }).catch(() => null),
    getOrCreateUserPreferences({ request, userId }),
  ]);
  const actualFirstName = getUserFirstName({ preferredFirstName: profile?.firstName, fullName: profile?.fullName });
  const firstNameForResponse = resolveFirstNameForResponse({
    fullName: profile?.fullName,
    firstName: profile?.firstName,
    messages: historyMessages,
    isInitialReading: true,
    userMessage: String(session.question),
  });
  let interpretation = "";
  let status = "complete";

  try {
    const prompt = buildTarotInitialPrompt({
        language: preferences.language === "hi" ? "Hindi" : "English",
        languageCode: preferences.language === "hi" ? "hindi" : "english",
        firstName: firstNameForResponse,
        question: String(session.question),
        spreadType,
        spreadName: String(session.spread_name),
        cards: drawnCards,
        conversationText,
        historyMessages,
        responseDepth: preferenceToResponseDepth(preferences.responseDetail, String(session.question)),
      });
    const rawInterpretation = await callGroundedBhagyaOpenAI({
      instructions: prompt.instructions,
      input: conversationText,
      maxOutputTokens: GUIDANCE_OUTPUT_LIMITS[prompt.depth],
      validate: (candidate) =>
        findUnsupportedTarotCards({
          answer: candidate,
          selectedCards: drawnCards,
          allCardNames: tarotDeck.map((card) => card.name),
        }),
    });
    interpretation = finalizeGuidanceResponse({
      answer: rawInterpretation,
      depth: prompt.depth,
      evidence: prompt.evidence,
      history: historyMessages,
      firstName: actualFirstName,
      fullName: profile?.fullName,
      allowJi: /\b(?:call|address)\b.{0,30}\bji\b/i.test(
        String(session.question),
      ),
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
    .update({ status: "complete", selected_indexes: selected.indexes })
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

  const { chatId, service, question, messages, languageCode } =
    validation.value;
  const rate = checkRateLimit(userId);

  if (!rate.allowed) {
    return rateLimitedResponse(languageCode);
  }

  const [reading, profile, preferences, storedMessages] = await Promise.all([
    getLatestTarotReading({ request, userId, chatId }),
    getSavedUserProfile({ request, userId }).catch(() => null),
    getOrCreateUserPreferences({ request, userId }),
    chatId
      ? listChatMessages({ request, userId, chatId })
      : Promise.resolve(messages),
  ]);

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

  const contextualMessages = preferences.useChatPersonalization ? storedMessages : messages;
  const cleanHistory = sanitizeMessages(contextualMessages, {
    service: "tarot",
    limit: 18,
  });
  const historyMessages = cleanHistory.map((message) => ({
    role: message.role === "assistant" ? "assistant" as const : "user" as const,
    content: message.content,
  }));
  const conversationText = buildConversationText(contextualMessages, question, {
    service: "tarot",
    limit: 18,
  });
  const actualFirstName = getUserFirstName({ preferredFirstName: profile?.firstName, fullName: profile?.fullName });
  const firstNameForResponse = resolveFirstNameForResponse({
    fullName: profile?.fullName,
    firstName: profile?.firstName,
    messages: historyMessages,
    isInitialReading: false,
    userMessage: question,
  });
  const prompt = buildTarotFollowUpPrompt({
    language: preferences.language === "hi" ? "Hindi" : "English",
    languageCode: preferences.language === "hi" ? "hindi" : "english",
    firstName: firstNameForResponse,
    question,
    reading,
    conversationText,
    historyMessages,
    responseDepth: preferenceToResponseDepth(preferences.responseDetail, question),
  });
  const rawAnswer = await callGroundedBhagyaOpenAI({
    instructions: prompt.instructions,
    input: conversationText,
    maxOutputTokens: GUIDANCE_OUTPUT_LIMITS[prompt.depth],
    validate: (candidate) =>
      findUnsupportedTarotCards({
        answer: candidate,
        selectedCards: reading.cards,
        allCardNames: tarotDeck.map((card) => card.name),
      }),
  });
  const answer = finalizeGuidanceResponse({
    answer: rawAnswer,
    depth: prompt.depth,
    evidence: prompt.evidence,
    history: historyMessages,
    firstName: actualFirstName,
    fullName: profile?.fullName,
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

    if (
      isRecord(body) &&
      (body.action === "create-session" || body.action === "start-session")
    ) {
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
