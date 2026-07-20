import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { getSavedUserProfile } from "@/lib/backend/birthDetailsMemory";
import {
  findUserChat,
  listChatMessages,
  saveAiExchange,
} from "@/lib/backend/chats";
import {
  buildConversationText,
  sanitizeMessages,
} from "@/lib/backend/conversation";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import {
  badRequestResponse,
  rateLimitedResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { callGroundedBhagyaOpenAI } from "@/lib/guidance/generate";
import { findUnsupportedPalmClaims } from "@/lib/guidance/groundingChecks";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { isUuid, validateAiRequestBody } from "@/lib/backend/validation";
import {
  buildPalmistryEvidence,
  buildPalmistryPrompt,
  sanitizePalmAnalysisContext,
  type PalmAnalysisContext,
} from "@/lib/palmistry/prompt";
import {
  finalizeGuidanceResponse,
  GUIDANCE_OUTPUT_LIMITS,
  resolveFirstNameForResponse,
  selectGuidanceResponseDepth,
} from "@/lib/guidance/promptCore";
import { buildPalmImageMissingResponse } from "@/lib/guidanceResponses";
import { getOrCreateUserPreferences } from "@/lib/backend/userPreferences";
import { getUserFirstName, preferenceToResponseDepth } from "@/lib/userPreferences";

export const runtime = "nodejs";

const routeName = "api/palmistry";
const palmBucket = "palm-images";
const maxPalmImageSize = 20 * 1024 * 1024;
const allowedPalmImageTypes = ["image/jpeg", "image/png", "image/webp"];

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

function logPalmistryError(label: string, error: unknown) {
  console.error(`[palmistry] ${label}`, {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });

  if (error && typeof error === "object") {
    const maybeOpenAiError = error as {
      status?: unknown;
      code?: unknown;
      type?: unknown;
      message?: unknown;
    };

    console.error("[palmistry] OpenAI error", {
      status: maybeOpenAiError.status,
      code: maybeOpenAiError.code,
      type: maybeOpenAiError.type,
      message: maybeOpenAiError.message,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[/\\]/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "palm-photo"
  );
}

function isAllowedPalmStoragePath({
  storagePath,
  userId,
  chatId,
}: {
  storagePath: string;
  userId: string;
  chatId: string;
}) {
  return (
    storagePath.startsWith(`${userId}/${chatId}/`) &&
    !storagePath.includes("..") &&
    !storagePath.includes("\\") &&
    !storagePath.includes("//")
  );
}

function parsePalmReadingJson(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(withoutFence);

    if (isRecord(parsed)) {
      return {
        usable: parsed.usable === true,
        qualityReason:
          typeof parsed.qualityReason === "string"
            ? parsed.qualityReason
            : "",
        reading: typeof parsed.reading === "string" ? parsed.reading : "",
        context: sanitizePalmAnalysisContext(parsed.context),
      };
    }
  } catch {
    return {
      usable: true,
      qualityReason: "",
      reading: text,
      context: undefined,
    };
  }

  return {
    usable: true,
    qualityReason: "",
    reading: text,
    context: undefined,
  };
}

function isOpenAiTimeout(error: unknown) {
  if (!(error && typeof error === "object")) return false;

  const maybeError = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };

  return (
    maybeError.name === "TimeoutError" ||
    maybeError.code === "ETIMEDOUT" ||
    (typeof maybeError.message === "string" &&
      /\btimeout|timed out\b/i.test(maybeError.message))
  );
}

function buildImageMessageContent({
  storagePath,
  signedUrl,
  fileName,
  mimeType,
  size,
  palmContext,
}: {
  storagePath: string;
  signedUrl?: string;
  fileName: string;
  mimeType: string;
  size: number;
  palmContext?: PalmAnalysisContext;
}) {
  const basePayload = {
    type: "bhagya.image",
    mode: "palmistry",
    bucket: palmBucket,
    text: "Palm photo stored for analysis.",
    storagePath,
    imageName: fileName,
    imageMimeType: mimeType,
    imageSize: size,
    palmContext,
  };

  return {
    persistedContent: JSON.stringify(basePayload),
    content: JSON.stringify({
      ...basePayload,
      imageUrl: signedUrl,
    }),
  };
}

function extractPalmContextFromMessages(messages: unknown) {
  if (!Array.isArray(messages)) return undefined;

  for (const message of [...messages].reverse()) {
    if (!isRecord(message) || typeof message.content !== "string") continue;

    try {
      const payload: unknown = JSON.parse(message.content);

      if (
        isRecord(payload) &&
        payload.type === "bhagya.image" &&
        payload.mode === "palmistry"
      ) {
        const context = sanitizePalmAnalysisContext(payload.palmContext);

        if (context) return context;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function validatePalmImageBody(body: unknown) {
  const validation = validateAiRequestBody(body);

  if (!validation.ok) {
    return { ok: false as const, status: 400, code: "BAD_REQUEST", message: validation.error };
  }

  if (!isRecord(body)) {
    return {
      ok: false as const,
      status: 400,
      code: "BAD_REQUEST",
      message: "Invalid request body.",
    };
  }

  const storagePath =
    typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  const fileName =
    typeof body.fileName === "string"
      ? sanitizeFileName(body.fileName)
      : "Palm photo";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;
  const chatId = validation.value.chatId || "";

  if (!chatId || !isUuid(chatId)) {
    return {
      ok: false as const,
      status: 400,
      code: "BAD_REQUEST",
      message: "Invalid chat id.",
    };
  }

  if (!storagePath) {
    return {
      ok: false as const,
      status: 400,
      code: "STORAGE_PATH_REQUIRED",
      message: "The uploaded palm photo could not be found.",
    };
  }

  if (!allowedPalmImageTypes.includes(mimeType)) {
    return {
      ok: false as const,
      status: 415,
      code: "UNSUPPORTED_IMAGE",
      message: "This image format is not supported. Please upload JPG, PNG, or WEBP.",
    };
  }

  if (fileSize > maxPalmImageSize) {
    return {
      ok: false as const,
      status: 413,
      code: "IMAGE_TOO_LARGE",
      message: "Please choose an image smaller than 20 MB.",
    };
  }

  if (validation.value.service !== "palmistry") {
    return {
      ok: false as const,
      status: 400,
      code: "BAD_REQUEST",
      message: "Invalid service selected.",
    };
  }

  return {
    ok: true as const,
    value: {
      ...validation.value,
      chatId,
      storagePath,
      fileName,
      mimeType,
      fileSize,
    },
  };
}

async function savePalmReadingMessages({
  request,
  userId,
  chatId,
  languageCode,
  imageContent,
  answer,
}: {
  request: Request;
  userId: string;
  chatId: string;
  languageCode: string;
  imageContent: string;
  answer: string;
}) {
  const supabase = createSupabaseUserClient(request);
  const chat = await findUserChat({ supabase, userId, chatId });

  if (!chat) {
    throw new Error("CHAT_NOT_FOUND");
  }

  const { error } = await supabase.from("messages").insert([
    {
      chat_id: chatId,
      user_id: userId,
      role: "user",
      content: imageContent,
      service: "palmistry",
      language_code: languageCode,
    },
    {
      chat_id: chatId,
      user_id: userId,
      role: "assistant",
      content: answer,
      service: "palmistry",
      language_code: languageCode,
    },
  ]);

  if (error) throw error;

  const { error: updateError } = await supabase
    .from("chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId)
    .eq("user_id", userId);

  if (updateError) throw updateError;
}

async function handleImageAnalysisFromStorage({
  request,
  userId,
  body,
}: {
  request: Request;
  userId: string;
  body: unknown;
}) {
  const validation = validatePalmImageBody(body);

  if (!validation.ok) {
    return apiError(validation.status, validation.code, validation.message);
  }

  const {
    chatId,
    storagePath,
    fileName,
    mimeType,
    fileSize,
    question,
    messages,
    language,
    languageCode,
  } = validation.value;

  if (!isAllowedPalmStoragePath({ storagePath, userId, chatId })) {
    return apiError(
      403,
      "INVALID_STORAGE_PATH",
      "This palm photo cannot be accessed."
    );
  }

  const rate = checkRateLimit(userId);

  if (!rate.allowed) {
    return rateLimitedResponse(languageCode);
  }

  const supabase = createSupabaseUserClient(request);
  const chat = await findUserChat({ supabase, userId, chatId });

  if (!chat) {
    return apiError(404, "CHAT_NOT_FOUND", "Chat not found.");
  }

  if (!allowedPalmImageTypes.includes(mimeType)) {
    return apiError(
      415,
      "UNSUPPORTED_IMAGE",
      "This image format is not supported. Please upload JPG, PNG, or WEBP."
    );
  }

  if (fileSize > maxPalmImageSize) {
    return apiError(
      413,
      "IMAGE_TOO_LARGE",
      "Please choose an image smaller than 20 MB."
    );
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(palmBucket)
    .createSignedUrl(storagePath, 300);

  if (signedError || !signedData?.signedUrl) {
    logPalmistryError("signed URL failed", signedError);
    return apiError(
      404,
      "PALM_IMAGE_ACCESS_FAILED",
      "Bhagya could not access this palm photo. Please upload it again."
    );
  }

  const conversationText = buildConversationText(messages, question);
  const historyMessages = sanitizeMessages(messages, {
    service: "palmistry",
    limit: 18,
  }).map((message) => ({
    role: message.role === "assistant" ? "assistant" as const : "user" as const,
    content: message.content,
  }));
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
    userMessage: question,
  });

  try {
    const responseDepth = preferenceToResponseDepth(preferences.responseDetail, question);
    const prompt = buildPalmistryPrompt({
      language: preferences.language === "hi" ? "Hindi" : "English",
      languageCode: preferences.language === "hi" ? "hindi" : "english",
      conversationText,
      historyMessages,
      firstName: firstNameForResponse,
      currentQuestion: question,
      wantsJson: true,
      responseDepth,
    });
    const rawAnswer = await callBhagyaOpenAI({
      instructions: prompt.instructions,
      input: conversationText,
      imageUrl: signedData.signedUrl,
      maxOutputTokens: 1600,
    });
    const parsedAnswer = parsePalmReadingJson(rawAnswer);

    if (!parsedAnswer.usable) {
      return apiError(
        422,
        "PALM_NOT_CLEAR",
        parsedAnswer.qualityReason ||
          "Please upload another photo showing the complete palm, wrist and fingers in bright, even light."
      );
    }

    const parsedEvidence = buildPalmistryEvidence(parsedAnswer.context);

    if (!parsedAnswer.context || parsedEvidence.length === 0) {
      return apiError(
        502,
        "PALM_CONTEXT_MISSING",
        "Bhagya could not preserve enough visible palm detail for reliable follow-up guidance. Please try the analysis again."
      );
    }

    const imageMessage = buildImageMessageContent({
      storagePath,
      signedUrl: signedData.signedUrl,
      fileName,
      mimeType,
      size: fileSize,
      palmContext: parsedAnswer.context,
    });
    const answer = finalizeGuidanceResponse({
      answer: parsedAnswer.reading || rawAnswer,
      depth: responseDepth,
      evidence: parsedEvidence,
      history: historyMessages,
      firstName: actualFirstName,
      fullName: profile?.fullName,
      allowJi: /\b(?:call|address)\b.{0,30}\bji\b/i.test(question),
    });

    try {
      await savePalmReadingMessages({
        request,
        userId,
        chatId,
        languageCode,
        imageContent: imageMessage.persistedContent,
        answer,
      });
    } catch (error) {
      logPalmistryError("database save failed", error);
      return apiError(
        500,
        "DB_SAVE_FAILED",
        "Your reading was generated, but could not be saved. Please try again."
      );
    }

    return NextResponse.json({
      success: true,
      answer,
      imageMessage,
      saved: true,
    });
  } catch (error) {
    logPalmistryError("OpenAI analysis failed", error);

    if (isOpenAiTimeout(error)) {
      return apiError(
        504,
        "OPENAI_TIMEOUT",
        "The palm analysis took too long. Please try again."
      );
    }

    return apiError(
      500,
      "PALM_ANALYSIS_FAILED",
      "The image was uploaded, but the palm analysis could not be completed."
    );
  }
}

async function handleTextPalmistry({
  request,
  userId,
  body,
}: {
  request: Request;
  userId: string;
  body: unknown;
}) {
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

  const [storedMessages, profile, preferences] = await Promise.all([
    chatId
      ? listChatMessages({ request, userId, chatId })
      : Promise.resolve(messages),
    getSavedUserProfile({ request, userId }).catch(() => null),
    getOrCreateUserPreferences({ request, userId }),
  ]);
  const palmContext = extractPalmContextFromMessages(storedMessages);

  if (!palmContext) {
    const answer = buildPalmImageMissingResponse(languageCode);
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
    service: "palmistry",
    limit: 18,
  });
  const historyMessages = cleanHistory.map((message) => ({
    role: message.role === "assistant" ? "assistant" as const : "user" as const,
    content: message.content,
  }));
  const conversationText = buildConversationText(contextualMessages, question, {
    service: "palmistry",
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
  const responseDepth = preferenceToResponseDepth(preferences.responseDetail, question) || selectGuidanceResponseDepth(question);
  const effectiveLanguageCode = preferences.language === "hi" ? "hindi" : "english";
  const effectiveLanguage = preferences.language === "hi" ? "Hindi" : "English";
  const prompt = buildPalmistryPrompt({
    language: effectiveLanguage,
    languageCode: effectiveLanguageCode,
    conversationText,
    historyMessages,
    firstName: firstNameForResponse,
    currentQuestion: question,
    palmContext,
    responseDepth,
  });
  const rawAnswer = await callGroundedBhagyaOpenAI({
    instructions: prompt.instructions,
    input: conversationText,
    maxOutputTokens: GUIDANCE_OUTPUT_LIMITS[responseDepth],
    validate: (candidate) => findUnsupportedPalmClaims(candidate, palmContext),
  });
  const answer = finalizeGuidanceResponse({
    answer: rawAnswer,
    depth: responseDepth,
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
      "Please sign in again to analyse your palm."
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Invalid JSON body.");
  }

  try {
    if (isRecord(body) && typeof body.storagePath === "string") {
      return await handleImageAnalysisFromStorage({
        request,
        userId: user.id,
        body,
      });
    }

    return await handleTextPalmistry({ request, userId: user.id, body });
  } catch (error) {
    logPalmistryError("analysis failed", error);
    return apiError(
      500,
      "PALM_ANALYSIS_FAILED",
      "The image was uploaded, but the palm analysis could not be completed."
    );
  }
}
