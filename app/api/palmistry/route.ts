import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
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
import {
  buildPalmistryPrompt,
  hasPalmEvidence,
} from "@/lib/palmistry/palmistryPrompt";
import { buildPalmImageMissingResponse } from "@/lib/guidanceResponses";

const routeName = "api/palmistry";

function getStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getLatestPalmImageUrl(
  body: Record<string, unknown>,
  messages: Array<{ imageUrl?: string; content?: string }>
) {
  const directImage =
    getStringField(body, "palmImage") ||
    getStringField(body, "imageUrl") ||
    getStringField(body, "image");

  if (directImage) return directImage;

  for (const message of [...messages].reverse()) {
    if (message.imageUrl) return message.imageUrl;

    if (typeof message.content === "string" && message.content.startsWith("{")) {
      try {
        const payload: unknown = JSON.parse(message.content);

        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          "type" in payload &&
          payload.type === "bhagya.image" &&
          "imageUrl" in payload &&
          typeof payload.imageUrl === "string"
        ) {
          return payload.imageUrl;
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
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
    const rawBody =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const palmImageUrl = getLatestPalmImageUrl(rawBody, messages);

    if (!palmImageUrl && !hasPalmEvidence(rawBody, conversationText)) {
      const answer = buildPalmImageMissingResponse(languageCode);
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
      instructions: buildPalmistryPrompt({
        language,
        languageCode,
        conversationText,
      }),
      input: conversationText,
      imageUrl: palmImageUrl,
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
