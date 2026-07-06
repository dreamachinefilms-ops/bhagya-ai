import { NextResponse } from "next/server";
import { getRequiredInfoResponse } from "../_lib/bhagyaPrompt";
import { requireUser } from "@/lib/backend/auth";
import { saveAiExchange } from "@/lib/backend/chats";
import {
  buildConversationText,
  buildUserConversationText,
} from "@/lib/backend/conversation";
import {
  badRequestResponse,
  rateLimitedResponse,
  safeErrorResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import { validateAiRequestBody } from "@/lib/backend/validation";
import {
  buildTarotPrompt,
  drawDeterministicTarotCards,
} from "@/lib/tarot/drawCards";

const routeName = "api/tarot";

function isSimpleTarotQuestion(question: string) {
  return question.split(/\s+/).filter(Boolean).length <= 8;
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
    const userConversationText = buildUserConversationText(messages, question);
    const requiredInfoResponse = getRequiredInfoResponse(
      service,
      userConversationText,
      languageCode
    );

    if (requiredInfoResponse) {
      const saved = await saveAiExchange({
        request,
        routeName,
        userId: user.id,
        chatId,
        service,
        languageCode,
        question,
        answer: requiredInfoResponse,
      });

      return NextResponse.json({ answer: requiredInfoResponse, ...saved });
    }

    const selectedCards = drawDeterministicTarotCards({
      userId: user.id,
      question,
      timestamp:
        body &&
        typeof body === "object" &&
        "timestamp" in body &&
        (typeof body.timestamp === "string" ||
          typeof body.timestamp === "number")
          ? body.timestamp
          : undefined,
      count: isSimpleTarotQuestion(question) ? 1 : 3,
    });

    const answer = await callBhagyaOpenAI({
      instructions: buildTarotPrompt({
        language,
        languageCode,
        conversationText,
        selectedCards,
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
