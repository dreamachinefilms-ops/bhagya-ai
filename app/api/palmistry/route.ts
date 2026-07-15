import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { getSavedUserProfile } from "@/lib/backend/birthDetailsMemory";
import { saveAiExchange } from "@/lib/backend/chats";
import { buildConversationText } from "@/lib/backend/conversation";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import {
  badRequestResponse,
  rateLimitedResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { validateAiRequestBody } from "@/lib/backend/validation";
import { buildPalmistryPrompt, hasPalmEvidence } from "@/lib/palmistry/palmistryPrompt";
import { buildPalmImageMissingResponse } from "@/lib/guidanceResponses";

export const runtime = "nodejs";

const routeName = "api/palmistry";
const palmBucket = "palm-images";
const maxPalmImageSize = 10 * 1024 * 1024;
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

function parseMessages(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;

      return {
        usable: record.usable === true,
        qualityReason:
          typeof record.qualityReason === "string"
            ? record.qualityReason
            : "",
        reading: typeof record.reading === "string" ? record.reading : "",
      };
    }
  } catch {
    return {
      usable: true,
      qualityReason: "",
      reading: text,
    };
  }

  return {
    usable: true,
    qualityReason: "",
    reading: text,
  };
}

function buildImageMessageContent({
  storagePath,
  signedUrl,
  fileName,
  mimeType,
  size,
}: {
  storagePath?: string;
  signedUrl?: string;
  fileName: string;
  mimeType: string;
  size: number;
}) {
  const basePayload = {
    type: "bhagya.image",
    mode: "palmistry",
    text: storagePath
      ? "Palm photo stored for analysis."
      : "Palm photo uploaded for analysis. Image storage is not configured yet.",
    storagePath,
    imageName: fileName,
    imageMimeType: mimeType,
    imageSize: size,
  };

  return {
    persistedContent: JSON.stringify(basePayload),
    content: JSON.stringify({
      ...basePayload,
      imageUrl: signedUrl,
    }),
  };
}

async function uploadPalmImage({
  request,
  userId,
  chatId,
  imageFile,
}: {
  request: Request;
  userId: string;
  chatId: string;
  imageFile: File;
}) {
  const supabase = createSupabaseUserClient(request);
  const safeFileName = sanitizeFileName(imageFile.name || "palm-photo");
  const storagePath = `${userId}/${chatId}/${Date.now()}-${safeFileName}`;
  const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(palmBucket)
    .upload(storagePath, imageBuffer, {
      contentType: imageFile.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[palmistry] storage upload failed", {
      message: uploadError.message,
      name: uploadError.name,
    });

    return {
      storagePath: undefined,
      signedUrl: undefined,
      imageBuffer,
    };
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(palmBucket)
    .createSignedUrl(storagePath, 60 * 60);

  if (signedError) {
    console.error("[palmistry] storage signed url failed", {
      message: signedError.message,
      name: signedError.name,
    });
  }

  return {
    storagePath,
    signedUrl: signedData?.signedUrl,
    imageBuffer,
  };
}

async function handleImageAnalysis(request: Request, userId: string) {
  const formData = await request.formData();
  const imageValue = formData.get("image");

  if (!(imageValue instanceof File)) {
    return apiError(400, "IMAGE_REQUIRED", "Please upload a palm photo first.");
  }

  const imageFile = imageValue;

  if (imageFile.size <= 0) {
    return apiError(400, "IMAGE_REQUIRED", "Please upload a palm photo first.");
  }

  if (imageFile.size > maxPalmImageSize) {
    return apiError(
      413,
      "IMAGE_TOO_LARGE",
      "The image is too large. Please upload a photo under 10 MB."
    );
  }

  if (!allowedPalmImageTypes.includes(imageFile.type)) {
    return apiError(
      415,
      "UNSUPPORTED_IMAGE",
      "Please upload a JPG, PNG or WEBP image."
    );
  }

  const question =
    typeof formData.get("question") === "string"
      ? String(formData.get("question")).trim()
      : "Palm photo uploaded for analysis.";
  const languageCode =
    typeof formData.get("languageCode") === "string"
      ? String(formData.get("languageCode"))
      : "english";
  const language =
    typeof formData.get("language") === "string"
      ? String(formData.get("language"))
      : "English";
  const chatId =
    typeof formData.get("chatId") === "string"
      ? String(formData.get("chatId")).trim()
      : "";
  const messages = parseMessages(formData.get("messages"));

  const rate = checkRateLimit(userId);

  if (!rate.allowed) {
    return rateLimitedResponse(languageCode);
  }

  const conversationText = buildConversationText(messages, question);
  const profile = await getSavedUserProfile({ request, userId }).catch(() => null);
  const upload = await uploadPalmImage({
    request,
    userId,
    chatId: chatId || "pending",
    imageFile,
  });
  const base64Image = upload.imageBuffer.toString("base64");
  const dataUrl = `data:${imageFile.type};base64,${base64Image}`;

  try {
    const rawAnswer = await callBhagyaOpenAI({
      instructions: buildPalmistryPrompt({
        language,
        languageCode,
        conversationText,
        firstName: profile?.firstName || undefined,
        wantsJson: true,
      }),
      input: conversationText,
      imageUrl: dataUrl,
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

    const imageMessage = buildImageMessageContent({
      storagePath: upload.storagePath,
      signedUrl: upload.signedUrl,
      fileName: imageFile.name || "Palm photo",
      mimeType: imageFile.type,
      size: imageFile.size,
    });

    return NextResponse.json({
      success: true,
      answer: parsedAnswer.reading || rawAnswer,
      imageMessage,
      storageConfigured: Boolean(upload.storagePath),
    });
  } catch (error) {
    logPalmistryError("analysis failed", error);

    return apiError(
      500,
      "PALM_ANALYSIS_FAILED",
      "Bhagya could not analyse this photo right now. Please try again."
    );
  }
}

async function handleTextPalmistry(request: Request, userId: string) {
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
  const rate = checkRateLimit(userId);

  if (!rate.allowed) {
    return rateLimitedResponse(languageCode);
  }

  const conversationText = buildConversationText(messages, question);
  const rawBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  if (!hasPalmEvidence(rawBody, conversationText)) {
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

  const profile = await getSavedUserProfile({ request, userId }).catch(() => null);
  const answer = await callBhagyaOpenAI({
    instructions: buildPalmistryPrompt({
      language,
      languageCode,
      conversationText,
      firstName: profile?.firstName || undefined,
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
      "Please sign in again to analyse your palm."
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return await handleImageAnalysis(request, user.id);
    }

    return await handleTextPalmistry(request, user.id);
  } catch (error) {
    logPalmistryError("analysis failed", error);
    return apiError(
      500,
      "PALM_ANALYSIS_FAILED",
      "Bhagya could not analyse this photo right now. Please try again."
    );
  }
}
