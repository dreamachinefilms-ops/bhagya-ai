import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { badRequestResponse } from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { isUuid } from "@/lib/backend/validation";
import {
  buildPalmVisualMapPrompt,
  parsePalmVisualMapJson,
} from "@/lib/palmistry/visualMap";

export const runtime = "nodejs";

const palmBucket = "palm-images";

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, code, message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAllowedPalmStoragePath({
  storagePath,
  userId,
  chatId,
}: {
  storagePath: string;
  userId: string;
  chatId?: string;
}) {
  if (
    !storagePath.startsWith(`${userId}/`) ||
    storagePath.includes("..") ||
    storagePath.includes("\\") ||
    storagePath.includes("//")
  ) {
    return false;
  }

  return chatId ? storagePath.startsWith(`${userId}/${chatId}/`) : true;
}

function logVisualMapError(label: string, error: unknown) {
  console.error(`[palmistry:visual-map] ${label}`, {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    status:
      error && typeof error === "object" && "status" in error
        ? (error as { status?: unknown }).status
        : undefined,
    code:
      error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code
        : undefined,
  });
}

export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);

  if (authError || !user) {
    return apiError(
      401,
      "AUTH_REQUIRED",
      "Please sign in again to map your palm photo."
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Invalid JSON body.");
  }

  if (!isRecord(body)) {
    return badRequestResponse("Invalid request body.");
  }

  const storagePath =
    typeof body.storagePath === "string" ? body.storagePath.trim() : "";
  const chatId = typeof body.chatId === "string" ? body.chatId : undefined;

  if (!storagePath) {
    return apiError(
      400,
      "STORAGE_PATH_REQUIRED",
      "The uploaded palm photo could not be found."
    );
  }

  if (chatId && !isUuid(chatId)) {
    return apiError(400, "BAD_REQUEST", "Invalid chat id.");
  }

  if (!isAllowedPalmStoragePath({ storagePath, userId: user.id, chatId })) {
    return apiError(
      403,
      "INVALID_STORAGE_PATH",
      "This palm photo cannot be accessed."
    );
  }

  const supabase = createSupabaseUserClient(request);
  const { data: signedData, error: signedError } = await supabase.storage
    .from(palmBucket)
    .createSignedUrl(storagePath, 300);

  if (signedError || !signedData?.signedUrl) {
    logVisualMapError("signed URL failed", signedError);
    return apiError(
      404,
      "PALM_IMAGE_ACCESS_FAILED",
      "Bhagya could not access this photo. Please upload it again."
    );
  }

  try {
    const rawMap = await callBhagyaOpenAI({
      instructions: buildPalmVisualMapPrompt(),
      input:
        "Map the visible major palm creases for scanner animation. Return JSON only.",
      imageUrl: signedData.signedUrl,
    });
    const visualMap = parsePalmVisualMapJson(rawMap);

    return NextResponse.json({
      success: true,
      visualMap,
    });
  } catch (error) {
    logVisualMapError("OpenAI visual mapping failed", error);
    return apiError(
      502,
      "PALM_VISUAL_MAP_FAILED",
      "Bhagya could not map this palm photo clearly."
    );
  }
}
