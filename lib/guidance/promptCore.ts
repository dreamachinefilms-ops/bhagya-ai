export type GuidanceService =
  | "astrology"
  | "numerology"
  | "palmistry"
  | "tarot";

export type GuidanceResponseDepth = "brief" | "standard" | "deep";

export type GuidanceHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GuidanceEvidence = {
  source: string;
  value: string;
  confidence?: number;
};

export type GuidanceResponsePlan = {
  service: GuidanceService;
  userIntent: string;
  relevantEvidence: GuidanceEvidence[];
  alreadyDiscussed: string[];
  newAngle: string;
  responseLength: GuidanceResponseDepth;
  useFirstName: boolean;
  askFollowUp: boolean;
};

export type NameUsageContext = {
  isInitialReading: boolean;
  isEmotionallyImportant: boolean;
  messagesSinceLastNameUse: number;
};

export type ResponseQualityCheck = {
  containsForbiddenAddress: boolean;
  usesUnsupportedClaim: boolean;
  repeatsPreviousOpening: boolean;
  repeatsPreviousInsight: boolean;
  includesRelevantEvidence: boolean;
  usesCorrectFirstName: boolean;
  appropriateLength: boolean;
};

export const FORBIDDEN_USER_ADDRESS_TERMS = [
  "dost",
  "beta",
  "bhai",
  "bhaiya",
  "behen",
  "bandhu",
  "friend",
  "dear friend",
  "buddy",
  "bro",
  "sister",
  "child",
  "my child",
  "sir",
  "madam",
] as const;

export const GUIDANCE_OUTPUT_LIMITS: Record<GuidanceResponseDepth, number> = {
  brief: 140,
  standard: 320,
  deep: 650,
};

const acknowledgementPattern =
  /^(okay|ok|yes|yeah|yep|thanks|thank you|interesting|got it|understood)[.!]?$/i;
const deepRequestPattern =
  /\b(explain everything|full reading|full report|all of it|in detail|detailed reading|deep reading|go deeper|compare all|complete reading)\b/i;
const emotionalPattern =
  /\b(heartbroken|grieving|afraid|scared|anxious|worried|lost|overwhelmed|divorce|breakup|bereavement|crisis)\b/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOpening(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function directAddressPattern() {
  const terms = [
    ...FORBIDDEN_USER_ADDRESS_TERMS,
    "dear one",
    "my dear",
    "listen, my friend",
    "ji",
  ]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");

  return new RegExp(
    `(^|[.!?]\\s+|\\n+)\\s*(?:listen[, ]+)?(?:my\\s+dear\\s+|my\\s+|dear\\s+)?(?:${terms})(?=\\s*[,!:.\\-]|\\s+(?:your|you|the|this|that|i|we|let|what|it)\\b)`,
    "gi",
  );
}

export function getFirstName(fullName: string | null | undefined) {
  const normalized = fullName?.trim();

  if (!normalized) return null;

  return normalized.split(/\s+/)[0] || null;
}

export function shouldUseFirstName(context: NameUsageContext) {
  if (context.isInitialReading) return true;

  return (
    context.isEmotionallyImportant && context.messagesSinceLastNameUse >= 3
  );
}

export function getMessagesSinceLastNameUse(
  messages: GuidanceHistoryMessage[],
  firstName: string,
) {
  const namePattern = new RegExp(`\\b${escapeRegExp(firstName)}\\b`, "i");
  let assistantMessages = 0;

  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant") continue;
    if (namePattern.test(message.content)) return assistantMessages;
    assistantMessages += 1;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function resolveFirstNameForResponse({
  fullName,
  firstName,
  messages,
  isInitialReading,
  userMessage,
}: {
  fullName?: string | null;
  firstName?: string | null;
  messages: GuidanceHistoryMessage[];
  isInitialReading: boolean;
  userMessage: string;
}) {
  const resolved = getFirstName(firstName) || getFirstName(fullName);

  if (!resolved) return null;

  return shouldUseFirstName({
    isInitialReading,
    isEmotionallyImportant: emotionalPattern.test(userMessage),
    messagesSinceLastNameUse: getMessagesSinceLastNameUse(messages, resolved),
  })
    ? resolved
    : null;
}

export function selectGuidanceResponseDepth(
  message: string,
): GuidanceResponseDepth {
  const normalized = message.trim();
  const count = wordCount(normalized);

  if (deepRequestPattern.test(normalized) || count >= 35) return "deep";
  if (acknowledgementPattern.test(normalized) || count <= 2) return "brief";
  return "standard";
}

export function createGuidanceResponsePlan({
  service,
  userMessage,
  relevantEvidence,
  history,
  useFirstName,
  responseLength = selectGuidanceResponseDepth(userMessage),
}: {
  service: GuidanceService;
  userMessage: string;
  relevantEvidence: GuidanceEvidence[];
  history: GuidanceHistoryMessage[];
  useFirstName: boolean;
  responseLength?: GuidanceResponseDepth;
}): GuidanceResponsePlan {
  const recentAssistantMessages = history
    .filter((message) => message.role === "assistant")
    .slice(-3)
    .map((message) => message.content.replace(/\s+/g, " ").slice(0, 240));
  const normalizedIntent = userMessage.trim().replace(/\s+/g, " ");
  const isAcknowledgement = acknowledgementPattern.test(normalizedIntent);
  const isContinuation = /^(tell me more|more|why|how so|explain)$/i.test(
    normalizedIntent,
  );

  return {
    service,
    userIntent: normalizedIntent || "continue the active reading",
    relevantEvidence: relevantEvidence.slice(0, 10),
    alreadyDiscussed: recentAssistantMessages,
    newAngle: isAcknowledgement
      ? "Acknowledge briefly without restarting or summarizing the reading."
      : isContinuation
        ? "Continue the most recent insight and add one new evidence-backed layer."
        : "Answer the current intent directly using the strongest relevant evidence that has not just been repeated.",
    responseLength,
    useFirstName,
    askFollowUp:
      responseLength !== "brief" &&
      /\b(choose|choice|between|unsure|confused|decision)\b/i.test(userMessage),
  };
}

export function buildBhagyaCorePrompt({
  service,
  language,
  firstName,
  plan,
}: {
  service: GuidanceService;
  language: string;
  firstName?: string | null;
  plan: GuidanceResponsePlan;
}) {
  const lengthInstruction: Record<GuidanceResponseDepth, string> = {
    brief: "Be brief and natural, usually 20-70 words. Do not expand a short message into a report.",
    standard: "Give a focused conversational answer, usually 60-160 words.",
    deep: "Give a connected deeper answer, usually 140-320 words, without padding.",
  };

  return `
Shared Bhagya personality:
- You are Bhagya, a calm, perceptive and experienced spiritual guidance companion.
- Speak like a thoughtful professional Indian astrologer or guide: clear, personal, respectful, observant, intelligent and lightly mystical.
- Use plain English by default. Use Hinglish only when the selected language is Hinglish or the user explicitly requests it.
- Do not sound theatrical, preachy, childish, robotic, overly poetic, or like customer support.

Addressing the user:
- The only permitted name for this response is: ${firstName || "none"}.
- ${firstName ? "Use that first name only if the response plan permits it." : "Use no name and no substitute form of address."}
- Never use a full name, title, family-style term, slang, pet name, or generic relationship term.
- Forbidden forms of address: ${FORBIDDEN_USER_ADDRESS_TERMS.join(", ")}, dear one, my dear, and ji unless explicitly requested.
- Do not begin every reply with a name.

Personalization and continuity:
- This is a ${service} response. Ground it only in the verified ${service} evidence supplied below.
- Every substantive answer must use at least one relevant verified factor when evidence is available.
- Select only evidence relevant to the current message; do not dump every available detail.
- Continue from recent conversation instead of restarting the complete reading.
- Do not repeat an opening, conclusion, or insight that was just used unless the user asks for a recap.
- Never invent missing data or expose this internal response plan.

Tone and certainty:
- Explain the strongest pattern first and connect it naturally to the user's question.
- Present spiritual systems as traditional, reflective guidance rather than fixed truth.
- Distinguish verified data, traditional interpretation, and uncertainty.
- Never guarantee an outcome or use fear-based language.
- Do not predict death, diagnose illness, guarantee pregnancy or fertility, guarantee profit, legal outcomes, marriage dates, or job results.
- For medical, legal, financial, or crisis questions, keep the spiritual reflection limited and encourage appropriate professional help.
- Ask at most one specific follow-up question, and only when the response plan permits it. A complete answer may simply end.

Response plan (internal; never quote or mention it):
${JSON.stringify(plan, null, 2)}

Length for this response:
${lengthInstruction[plan.responseLength]}

Reply only in ${language}.
  `.trim();
}

export function sanitizeGuidanceResponse({
  answer,
  firstName,
  fullName,
  allowJi = false,
}: {
  answer: string;
  firstName?: string | null;
  fullName?: string | null;
  allowJi?: boolean;
}) {
  let sanitized = answer.trim().replace(directAddressPattern(), "$1");
  const resolvedFirstName = getFirstName(firstName || fullName);
  const normalizedFullName = fullName?.trim();

  if (
    normalizedFullName &&
    resolvedFirstName &&
    normalizedFullName.toLowerCase() !== resolvedFirstName.toLowerCase()
  ) {
    sanitized = sanitized.replace(
      new RegExp(`\\b${escapeRegExp(normalizedFullName)}\\b`, "gi"),
      resolvedFirstName,
    );
  }

  if (resolvedFirstName) {
    sanitized = sanitized.replace(
      new RegExp(`\\b(?:dear\\s+|my\\s+dear\\s+)${escapeRegExp(resolvedFirstName)}\\b`, "gi"),
      resolvedFirstName,
    );

    if (!allowJi) {
      sanitized = sanitized.replace(
        new RegExp(`\\b${escapeRegExp(resolvedFirstName)}\\s+ji\\b`, "gi"),
        resolvedFirstName,
      );
    }
  }

  return sanitized.replace(/^[,!:;\s]+/, "").replace(/\s{2,}/g, " ").trim();
}

export function checkGuidanceResponseQuality({
  answer,
  depth,
  evidence,
  history,
  firstName,
  fullName,
  unsupportedClaims = [],
}: {
  answer: string;
  depth: GuidanceResponseDepth;
  evidence: GuidanceEvidence[];
  history: GuidanceHistoryMessage[];
  firstName?: string | null;
  fullName?: string | null;
  unsupportedClaims?: string[];
}): ResponseQualityCheck {
  const count = wordCount(answer);
  const previous = history.filter((message) => message.role === "assistant").at(-1);
  const previousOpening = previous ? normalizeOpening(previous.content) : "";
  const currentOpening = normalizeOpening(answer);
  const normalizedAnswer = answer.toLowerCase();
  const relevantEvidenceTerms = evidence
    .flatMap((item) => [item.source, item.value])
    .map((item) => item.toLowerCase().trim())
    .filter((item) => item.length >= 2);
  const resolvedFirstName = getFirstName(firstName || fullName);
  const normalizedFullName = fullName?.trim().toLowerCase();
  const directForbidden = directAddressPattern().test(answer);
  const usesFullName = Boolean(
    normalizedFullName &&
      resolvedFirstName &&
      normalizedFullName !== resolvedFirstName.toLowerCase() &&
      normalizedAnswer.includes(normalizedFullName),
  );
  const lengthRanges: Record<GuidanceResponseDepth, [number, number]> = {
    brief: [1, 100],
    standard: [20, 220],
    deep: [60, 400],
  };
  const [minimum, maximum] = lengthRanges[depth];

  return {
    containsForbiddenAddress: directForbidden,
    usesUnsupportedClaim: unsupportedClaims.some((claim) =>
      normalizedAnswer.includes(claim.toLowerCase()),
    ),
    repeatsPreviousOpening: Boolean(
      previousOpening && currentOpening && previousOpening === currentOpening,
    ),
    repeatsPreviousInsight: Boolean(
      previous &&
        previous.content.length > 80 &&
        normalizedAnswer.includes(previous.content.toLowerCase().slice(0, 80)),
    ),
    includesRelevantEvidence:
      evidence.length === 0 ||
      relevantEvidenceTerms.some((term) => normalizedAnswer.includes(term)),
    usesCorrectFirstName: !usesFullName,
    appropriateLength: count >= minimum && count <= maximum,
  };
}

export function finalizeGuidanceResponse({
  answer,
  depth,
  evidence,
  history,
  firstName,
  fullName,
  allowJi = false,
  unsupportedClaims,
}: {
  answer: string;
  depth: GuidanceResponseDepth;
  evidence: GuidanceEvidence[];
  history: GuidanceHistoryMessage[];
  firstName?: string | null;
  fullName?: string | null;
  allowJi?: boolean;
  unsupportedClaims?: string[];
}) {
  const sanitized = sanitizeGuidanceResponse({
    answer,
    firstName,
    fullName,
    allowJi,
  });
  const quality = checkGuidanceResponseQuality({
    answer: sanitized,
    depth,
    evidence,
    history,
    firstName,
    fullName,
    unsupportedClaims,
  });

  if (process.env.NODE_ENV !== "production") {
    const warnings = [
      quality.containsForbiddenAddress && "containsForbiddenAddress",
      quality.usesUnsupportedClaim && "usesUnsupportedClaim",
      quality.repeatsPreviousOpening && "repeatsPreviousOpening",
      quality.repeatsPreviousInsight && "repeatsPreviousInsight",
      !quality.includesRelevantEvidence && "missingRelevantEvidence",
      !quality.usesCorrectFirstName && "incorrectFirstName",
      !quality.appropriateLength && "inappropriateLength",
    ].filter((warning): warning is string => Boolean(warning));

    if (warnings.length > 0) {
      console.info("[guidance-quality] response checks", { warnings });
    }
  }

  return sanitized;
}
