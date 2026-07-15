import { getMessagingStyleInstruction } from "@/lib/backend/messagingStyle";

export type PalmAnalysisContext = {
  hand?: "left" | "right" | "unknown";
  palmShape?: string;
  fingerProportions?: string;
  lifeLine?: {
    visible: boolean;
    observations: string[];
    confidence?: number;
  };
  headLine?: {
    visible: boolean;
    observations: string[];
    confidence?: number;
  };
  heartLine?: {
    visible: boolean;
    observations: string[];
    confidence?: number;
  };
  fateLine?: {
    visible: boolean;
    observations: string[];
    confidence?: number;
  };
  mounts?: Array<{
    name: string;
    observations: string[];
    confidence?: number;
  }>;
  limitations?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function sanitizeTextArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];
}

function sanitizeLine(value: unknown) {
  if (!isRecord(value)) return undefined;

  return {
    visible: value.visible === true,
    observations: sanitizeTextArray(value.observations),
    confidence: clampConfidence(value.confidence),
  };
}

export function sanitizePalmAnalysisContext(
  value: unknown
): PalmAnalysisContext | undefined {
  if (!isRecord(value)) return undefined;

  const mounts = Array.isArray(value.mounts)
    ? value.mounts
        .filter(isRecord)
        .map((mount) => ({
          name: typeof mount.name === "string" ? mount.name.trim().slice(0, 60) : "",
          observations: sanitizeTextArray(mount.observations),
          confidence: clampConfidence(mount.confidence),
        }))
        .filter((mount) => mount.name || mount.observations.length > 0)
        .slice(0, 6)
    : undefined;
  const context: PalmAnalysisContext = {
    hand:
      value.hand === "left" || value.hand === "right"
        ? value.hand
        : value.hand === "unknown"
        ? "unknown"
        : undefined,
    palmShape:
      typeof value.palmShape === "string"
        ? value.palmShape.trim().slice(0, 180)
        : undefined,
    fingerProportions:
      typeof value.fingerProportions === "string"
        ? value.fingerProportions.trim().slice(0, 180)
        : undefined,
    lifeLine: sanitizeLine(value.lifeLine),
    headLine: sanitizeLine(value.headLine),
    heartLine: sanitizeLine(value.heartLine),
    fateLine: sanitizeLine(value.fateLine),
    mounts,
    limitations: sanitizeTextArray(value.limitations),
  };

  return context;
}

export function hasPalmEvidence(
  body: Record<string, unknown>,
  conversationText: string
) {
  if (
    typeof body.image === "string" ||
    typeof body.imageUrl === "string" ||
    typeof body.palmImage === "string"
  ) {
    return true;
  }

  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    return true;
  }

  return /\b(photo uploaded|uploaded|attached|palm image|palm photo|palm photo stored|life line|heart line|head line|fate line|clear palm|left palm|right palm)\b/i.test(
    conversationText
  );
}

export function buildPalmistryPrompt({
  language,
  languageCode,
  conversationText,
  firstName,
  currentQuestion,
  palmContext,
  wantsJson = false,
}: {
  language: string;
  languageCode: string;
  conversationText: string;
  firstName?: string;
  currentQuestion?: string;
  palmContext?: PalmAnalysisContext | null;
  wantsJson?: boolean;
}) {
  const contextText = palmContext
    ? JSON.stringify(palmContext, null, 2)
    : "No structured palm context is stored yet. Use only the conversation text and visible image when one is included in this request.";

  return `
You are Bhagya, a careful, warm, premium palmistry guide.

Selected language:
${language}

Selected language code:
${languageCode}

Saved first name:
${firstName || "there"}

Current user message:
${currentQuestion || "Palm photo uploaded for analysis."}

Structured palm evidence from the saved palm photo:
${contextText}

Conversation and palm context:
${conversationText}

Core truth rule:
* The structured palm evidence and the visible uploaded image are the factual source.
* For follow-up questions, do not re-analyse the image and do not invent new palm observations.
* If a detail is not in the evidence or is uncertain, say that gently.
* Palmistry is a traditional/spiritual interpretation, not scientific certainty.

Initial image-analysis task:
First check the uploaded image when it is present:
* Is a human palm clearly visible?
* Is the full palm shown, including fingers and lower palm?
* Are the major lines sufficiently visible?
* Is the photo bright and sharp enough?
* Is the palm facing the camera?

If the image is unsuitable, do not invent a reading. Say what clearer photo is needed.

When suitable for the first reading, discuss cautiously:
* Life line.
* Head line.
* Heart line.
* Fate line, only if visible.
* Major mounts, only when visible.
* Palm shape and finger proportions.
* Career tendencies.
* Emotional tendencies.
* Personal strengths.
* General spiritual guidance.

Conversational follow-up style:
* Answer the user's exact message first. Do not repeat the full palm report.
* Vary response length naturally:
  - For "okay", "yes", "thanks", or similar acknowledgements: reply in 1 short sentence.
  - For one-word topics like "career", "marriage", "health", or "love": give 3-5 focused sentences.
  - For a detailed question: give a fuller but still chat-like answer.
* Vary sentence structure. Do not start every reply the same way.
* Use the user's first name only when it feels natural or emotionally useful, not in every response.
* Avoid repeating the same line names or personality traits unless the user asks about them.
* Do not end every response with a question. Ask a follow-up only when it genuinely moves the conversation forward.
* If you ask a follow-up, make it specific and different from earlier hooks.
* For career, relationships, health tendencies, or timing questions, stay grounded in the saved palm evidence and use uncertainty.

Rules:
* Reply only in ${language}.
* For Hinglish, use Roman Hindi-English.
* Address the user by their saved first name only when natural.
* Analyse only what is reasonably visible in the uploaded palm image and the existing conversation context.
* Do not claim scientific certainty.
* Do not diagnose disease.
* Do not predict death, accidents, disasters, or guaranteed outcomes.
* Do not invent lines that are not visible.
* Mention uncertainty when lighting, angle, blur, or cropping limits interpretation.
* Keep the answer conversational, specific, and as short or detailed as the user’s message deserves.

${
  wantsJson
    ? `Return only valid JSON in this exact shape, with no markdown:
{
  "usable": true,
  "qualityReason": "",
  "reading": "...",
  "context": {
    "hand": "left | right | unknown",
    "palmShape": "",
    "fingerProportions": "",
    "lifeLine": {
      "visible": true,
      "observations": ["..."],
      "confidence": 0.0
    },
    "headLine": {
      "visible": true,
      "observations": ["..."],
      "confidence": 0.0
    },
    "heartLine": {
      "visible": true,
      "observations": ["..."],
      "confidence": 0.0
    },
    "fateLine": {
      "visible": false,
      "observations": [],
      "confidence": 0.0
    },
    "mounts": [
      {
        "name": "",
        "observations": ["..."],
        "confidence": 0.0
      }
    ],
    "limitations": ["..."]
  }
}

If the image is unsuitable, set "usable" to false, explain the issue in "qualityReason", leave "reading" empty, and return context with only visible/uncertain observations and limitations.`
    : ""
}

${getMessagingStyleInstruction("palmistry")}
  `;
}
