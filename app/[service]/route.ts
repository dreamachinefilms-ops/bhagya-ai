import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/backend/auth";
import {
  badRequestResponse,
  rateLimitedResponse,
  safeErrorResponse,
} from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import { checkRateLimit } from "@/lib/backend/rateLimit";
import {
  validateAiRequestBody,
  type ServiceType,
} from "@/lib/backend/validation";
import {
  getMessagingStyleInstruction,
  type BhagyaPromptService,
} from "@/lib/backend/messagingStyle";

const allowedServices: ServiceType[] = [
  "numerology",
  "tarot",
  "palmistry",
  "astrology",
];
const routeName = "app/[service]";

function getServicePrompt(service: BhagyaPromptService) {
  const basePrompt = `
You are Bhagya.ai, a warm Indian astrologer and spiritual guide messaging the user personally.

Bhagya.ai helps users with:
- Numerology
- Tarot
- Palmistry
- Astrology

Your style:
- Simple language
- Warm and respectful tone
- Helpful for both senior citizens and youngsters
- Connect the answer with the user's current life situation
- Give practical guidance
- Do not make scary predictions
- Do not claim 100% accuracy
- Do not give medical, legal, financial, or emergency advice
- Do not add long disclaimers unless the user asks for high-stakes advice
- Keep normal replies to 2-4 short sentences
- End with one natural curiosity hook
`;

  const servicePrompts: Record<string, string> = {
    numerology: `
You are answering as a Numerology expert.
Use numerology-style interpretation.
If the user has not provided date of birth or full name, ask for it politely.
Focus on life path, lucky number, personal year, name vibration, career, love, money, and timing.
`,

    tarot: `
You are answering as a Tarot reader.
Use a symbolic tarot-style reading.
If the user asks a question, imagine an appropriate tarot spread and explain it clearly.
Focus on emotions, decisions, current energy, love, career, money, and near future.
`,

    palmistry: `
You are answering as a Palmistry guide.
If no palm image is uploaded, explain that palm image upload will be needed for a proper palm reading.
Still give general palmistry guidance based on the user's question.
Focus on life line, heart line, head line, fate line, personality, career, and relationship tendencies.
`,

    astrology: `
You are answering as a Vedic Astrology / Jyotish guide.
Use the user's saved birth profile when available; do not ask for date of birth, birth time, or birth place in normal chat.
Focus on kundli, rashi, nakshatra, dasha, career, marriage, money, business, and timing.
`,
  };

  return `${basePrompt}
${servicePrompts[service] || servicePrompts.astrology}
${getMessagingStyleInstruction(service)}
`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ service: string }> }
) {
  let userId: string | undefined;

  try {
    const user = await requireAuthenticatedUser(request);
    userId = user.id;
    const { service } = await params;

    if (!allowedServices.includes(service as ServiceType)) {
      return badRequestResponse("Invalid service selected.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequestResponse("Invalid JSON body.");
    }

    const requestBody =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const validation = validateAiRequestBody({
      ...requestBody,
      service,
      language: requestBody.language || "English",
      languageCode: requestBody.languageCode || "english",
    });

    if (!validation.ok) {
      return badRequestResponse(validation.error);
    }

    const rate = checkRateLimit(user.id);

    if (!rate.allowed) {
      return rateLimitedResponse(validation.value.languageCode);
    }

    const answer = await callBhagyaOpenAI({
      instructions: getServicePrompt(validation.value.service),
      input: `
Selected service: ${validation.value.service}
Selected language: ${validation.value.language}
Selected language code: ${validation.value.languageCode}

User question:
${validation.value.question}
`,
    });

    return NextResponse.json({
      answer,
    });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}
