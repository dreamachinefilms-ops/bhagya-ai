import { NextResponse } from "next/server";
import type { BhagyaService } from "@/app/api/_lib/bhagyaPrompt";
import { requireUser } from "@/lib/backend/auth";
import {
  addChatMessage,
  findUserChat,
  listChatMessages,
} from "@/lib/backend/chats";
import { safeErrorResponse } from "@/lib/backend/errors";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { isUuid } from "@/lib/backend/validation";
import { logNumerologyStage } from "@/lib/numerology/logging";

const routeName = "api/chats/[chatId]/messages";
type MessageRole = "user" | "assistant";

const allowedServices: BhagyaService[] = [
  "astrology",
  "numerology",
  "tarot",
  "palmistry",
];
const allowedRoles: MessageRole[] = ["user", "assistant"];
const MAX_TEXT_MESSAGE_LENGTH = 6000;
const MAX_IMAGE_MESSAGE_LENGTH = 15 * 1024 * 1024;

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Please login to continue." },
    { status: 401 }
  );
}

function isImageMessageContent(content: string) {
  if (!content.startsWith("{")) return false;

  try {
    const payload: unknown = JSON.parse(content);

    return Boolean(
      payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        "type" in payload &&
        payload.type === "bhagya.image" &&
        "imageUrl" in payload &&
        typeof payload.imageUrl === "string"
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;
    const { chatId } = await context.params;

    if (!isUuid(chatId)) {
      return NextResponse.json(
        { answer: "Invalid chat id.", error: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseUserClient(request);
    const chat = await findUserChat({
      supabase,
      userId: user.id,
      chatId,
    });

    if (!chat) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Chat not found." },
        { status: 404 }
      );
    }

    const messages = await listChatMessages({
      request,
      userId: user.id,
      chatId,
    });

    return NextResponse.json({ chat, messages });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;
    const { chatId } = await context.params;

    if (!isUuid(chatId)) {
      return NextResponse.json(
        { answer: "Invalid chat id.", error: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const role = allowedRoles.includes(body.role as MessageRole)
      ? (body.role as MessageRole)
      : "user";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const requestedService =
      typeof body.service === "string" ? body.service : "astrology";
    const service = allowedServices.includes(
      requestedService as BhagyaService
    )
      ? (requestedService as BhagyaService)
      : "astrology";

    if (!content) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Message content is required.",
        },
        { status: 400 }
      );
    }

    const maxContentLength = isImageMessageContent(content)
      ? MAX_IMAGE_MESSAGE_LENGTH
      : MAX_TEXT_MESSAGE_LENGTH;

    if (content.length > maxContentLength) {
      return NextResponse.json(
        {
          error: "BAD_REQUEST",
          message: "Message is too long.",
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseUserClient(request);
    const chat = await findUserChat({
      supabase,
      userId: user.id,
      chatId,
    });

    if (!chat) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Chat not found." },
        { status: 404 }
      );
    }

    const message = await addChatMessage({
      request,
      userId: user.id,
      chatId,
      message: {
        role,
        content,
        service,
        languageCode:
          typeof body.languageCode === "string" ? body.languageCode : undefined,
      },
    });

    if (service === "numerology") {
      logNumerologyStage(`${role} message saved`, {
        persistence: "shared-chat-route",
      });
    }

    return NextResponse.json({ message });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}
