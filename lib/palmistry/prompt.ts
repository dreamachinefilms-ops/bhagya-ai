import {
  buildBhagyaCorePrompt,
  createGuidanceResponsePlan,
  selectGuidanceResponseDepth,
  type GuidanceEvidence,
  type GuidanceHistoryMessage,
  type GuidanceResponseDepth,
} from "../guidance/promptCore.ts";

export type PalmAnalysisContext = {
  hand?: "left" | "right" | "unknown";
  palmShape?: string;
  fingerProportions?: string;
  lifeLine?: PalmLineEvidence;
  headLine?: PalmLineEvidence;
  heartLine?: PalmLineEvidence;
  fateLine?: PalmLineEvidence;
  mounts?: Array<{
    name: string;
    observations: string[];
    confidence?: number;
  }>;
  limitations?: string[];
};

type PalmLineEvidence = {
  visible: boolean;
  observations: string[];
  confidence?: number;
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

function sanitizeLine(value: unknown): PalmLineEvidence | undefined {
  if (!isRecord(value)) return undefined;

  return {
    visible: value.visible === true,
    observations: sanitizeTextArray(value.observations),
    confidence: clampConfidence(value.confidence),
  };
}

export function sanitizePalmAnalysisContext(
  value: unknown,
): PalmAnalysisContext | undefined {
  if (!isRecord(value)) return undefined;

  const mounts = Array.isArray(value.mounts)
    ? value.mounts
        .filter(isRecord)
        .map((mount) => ({
          name:
            typeof mount.name === "string"
              ? mount.name.trim().slice(0, 60)
              : "",
          observations: sanitizeTextArray(mount.observations),
          confidence: clampConfidence(mount.confidence),
        }))
        .filter((mount) => mount.name || mount.observations.length > 0)
        .slice(0, 6)
    : undefined;

  return {
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
}

export function hasPalmEvidence(
  body: Record<string, unknown>,
  conversationText: string,
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

  return /\b(photo uploaded|uploaded|attached|palm image|palm photo|palm photo stored)\b/i.test(
    conversationText,
  );
}

export function buildPalmistryEvidence(
  context?: PalmAnalysisContext | null,
): GuidanceEvidence[] {
  if (!context) return [];

  const evidence: GuidanceEvidence[] = [];
  const add = (
    source: string,
    value: string | undefined,
    confidence?: number,
  ) => {
    if (value?.trim()) evidence.push({ source, value: value.trim(), confidence });
  };

  add("saved photographed hand", context.hand);
  add("saved palm shape", context.palmShape);
  add("saved finger proportions", context.fingerProportions);

  const lines: Array<[string, PalmLineEvidence | undefined]> = [
    ["Life Line", context.lifeLine],
    ["Head Line", context.headLine],
    ["Heart Line", context.heartLine],
    ["Fate Line", context.fateLine],
  ];

  for (const [name, line] of lines) {
    if (!line) continue;
    add(
      `saved ${name}`,
      line.visible
        ? line.observations.join("; ") || "visible"
        : "not clearly visible",
      line.confidence,
    );
  }

  for (const mount of context.mounts || []) {
    add(
      `saved ${mount.name} mount observation`,
      mount.observations.join("; "),
      mount.confidence,
    );
  }

  for (const limitation of context.limitations || []) {
    add("saved image limitation", limitation);
  }

  return evidence;
}

export function buildPalmistryPrompt({
  language,
  languageCode,
  conversationText,
  historyMessages,
  firstName,
  currentQuestion,
  palmContext,
  wantsJson = false,
  responseDepth,
}: {
  language: string;
  languageCode: string;
  conversationText: string;
  historyMessages: GuidanceHistoryMessage[];
  firstName?: string | null;
  currentQuestion?: string;
  palmContext?: PalmAnalysisContext | null;
  wantsJson?: boolean;
  responseDepth?: GuidanceResponseDepth;
}) {
  const question = currentQuestion || "Palm photo uploaded for analysis.";
  const depth = responseDepth || selectGuidanceResponseDepth(question);
  const evidence = buildPalmistryEvidence(palmContext);
  const plan = createGuidanceResponsePlan({
    service: "palmistry",
    userMessage: question,
    relevantEvidence:
      evidence.length > 0
        ? evidence
        : [{ source: "current palm image", value: "attached for visual analysis" }],
    history: historyMessages,
    useFirstName: Boolean(firstName),
    responseLength: depth,
  });
  const contextText = palmContext
    ? JSON.stringify(palmContext, null, 2)
    : "No structured context exists yet. This is valid only for the initial request that includes the palm image.";

  return {
    depth,
    evidence,
    instructions: `
${buildBhagyaCorePrompt({
  service: "palmistry",
  language,
  firstName,
  plan,
})}

Palmistry language code: ${languageCode}

Current user message:
${question}

Structured evidence saved from the actual palm photo:
${contextText}

Recent active Palmistry conversation:
${conversationText}

Palmistry truth rules:
- On follow-ups, the structured saved evidence is the only factual palm source. Do not re-analyse the image or add a line, mount, shape, marking, or finger observation that is not stored above.
- If a stored line is faint, not visible, or low confidence, make that limitation explicit and do not infer precise timing from it.
- If the evidence does not support the user's exact question, say so naturally instead of substituting a generic palm claim.
- Interpret palm evidence as a traditional reflective practice, never scientific or medical fact.
- Answer narrow messages from the relevant saved line or feature instead of repeating the complete palm report.

Initial image task (only when an image is included in this request):
- First determine whether a human palm, fingers, lower palm, and major lines are sufficiently visible, bright, sharp, and facing the camera.
- If unsuitable, do not invent a reading; explain the specific photo problem.
- If suitable, record only reasonably visible Life, Head, Heart, and Fate Line observations, palm shape, finger proportions, mounts, confidence, and image limitations.
- Treat Fate Line and mount observations cautiously when visibility is weak.

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
    "lifeLine": { "visible": true, "observations": ["..."], "confidence": 0.0 },
    "headLine": { "visible": true, "observations": ["..."], "confidence": 0.0 },
    "heartLine": { "visible": true, "observations": ["..."], "confidence": 0.0 },
    "fateLine": { "visible": false, "observations": [], "confidence": 0.0 },
    "mounts": [{ "name": "", "observations": ["..."], "confidence": 0.0 }],
    "limitations": ["..."]
  }
}

If unsuitable, set "usable" to false, explain the issue in "qualityReason", leave "reading" empty, and include only visible or uncertain observations and limitations.`
        : "Return a normal conversational response, not JSON."
    }
    `.trim(),
  };
}
