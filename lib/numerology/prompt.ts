import { NUMEROLOGY_MEANINGS } from "./meanings.ts";
import type {
  NumerologyProfile,
  NumerologyResponseDepth,
} from "./types.ts";

const BRIEF_TOPICS = new Set([
  "okay", "ok", "yes", "career", "love", "money", "strengths", "challenges",
]);

export function selectNumerologyResponseDepth(
  message: string,
): NumerologyResponseDepth {
  const normalized = message.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (
    /\b(explain everything|full profile|all my numbers|in detail|detailed reading|deep reading|compare all|heartbroken|grieving|feel lost|deeply worried|life-changing)\b/i.test(normalized)
  ) {
    return "deep";
  }

  if (wordCount <= 2 || BRIEF_TOPICS.has(normalized)) return "brief";
  return "standard";
}

export function isCalculationExplanationRequest(message: string) {
  return /\b(how (?:did|was|is)|calculate|calculations?|show my numbers|show my calculations?|is this number correct|why am i)\b/i.test(
    message,
  );
}

export function buildDeterministicCalculationAnswer(
  profile: NumerologyProfile,
  message: string,
) {
  const normalized = message.toLowerCase();
  const calculations: Array<[string, { reducedNumber: number; steps: string[] }]> = [];

  if (/life path/.test(normalized)) {
    calculations.push(["Life Path", profile.coreNumbers.lifePath]);
  } else if (/expression|destiny|name number/.test(normalized)) {
    calculations.push(["Expression", profile.coreNumbers.expression]);
  } else if (/soul urge/.test(normalized)) {
    calculations.push(["Soul Urge", profile.coreNumbers.soulUrge]);
  } else if (/personality/.test(normalized)) {
    calculations.push(["Personality", profile.coreNumbers.personality]);
  } else if (/birthday/.test(normalized)) {
    calculations.push(["Birthday", profile.coreNumbers.birthday]);
  } else if (/personal year/.test(normalized)) {
    calculations.push(["Personal Year", profile.cycles.personalYear]);
  } else {
    calculations.push(
      ["Life Path", profile.coreNumbers.lifePath],
      ["Expression", profile.coreNumbers.expression],
      ["Soul Urge", profile.coreNumbers.soulUrge],
      ["Personality", profile.coreNumbers.personality],
      ["Birthday", profile.coreNumbers.birthday],
      ["Attitude", profile.coreNumbers.attitude],
      ["Maturity", profile.coreNumbers.maturity],
    );
  }

  return calculations
    .map(
      ([label, calculation]) =>
        `${label}: ${calculation.reducedNumber}\n${calculation.steps.join("\n")}`,
    )
    .join("\n\n");
}

export function buildNumerologyPrompt({
  profile,
  firstName,
  language,
  languageCode,
  history,
  question,
}: {
  profile: NumerologyProfile;
  firstName?: string | null;
  language: string;
  languageCode: string;
  history: string;
  question: string;
}) {
  const depth = selectNumerologyResponseDepth(question);
  const lengthRule = {
    brief: "Reply briefly, usually 20-70 words.",
    standard: "Give a focused answer, usually 60-150 words.",
    deep: "Give a connected deeper reading, usually 140-300 words.",
  }[depth];

  const toPromptNumber = (calculation: {
    reducedNumber: number;
    isMasterNumber: boolean;
  }) => ({
    number: calculation.reducedNumber,
    isMasterNumber: calculation.isMasterNumber,
  });
  const suppliedProfile = {
    coreNumbers: Object.fromEntries(
      Object.entries(profile.coreNumbers).map(([key, calculation]) => [
        key,
        toPromptNumber(calculation),
      ]),
    ),
    cycles: {
      personalYear: toPromptNumber(profile.cycles.personalYear),
      personalMonth: toPromptNumber(profile.cycles.personalMonth),
      personalDay: toPromptNumber(profile.cycles.personalDay),
      calculatedForDate: profile.cycles.calculatedForDate,
    },
    meanings: NUMEROLOGY_MEANINGS,
  };

  return `
You are Bhagya, a warm and perceptive spiritual guidance companion.

Language: ${language}
Language code: ${languageCode}
User first name: ${firstName || "not supplied"}

You are continuing a Numerology conversation using numbers already calculated deterministically by the application.

Grounding:
- Use only the supplied Numerology profile and conversation history.
- Never calculate, alter, or invent a number.
- If a required number is absent, say the profile needs to be refreshed.
- Treat Numerology as a traditional reflective practice, not scientific certainty.
- Do not guarantee future outcomes.

Supplied profile:
${JSON.stringify(suppliedProfile, null, 2)}

Recent conversation:
${history || "No previous conversation."}

Current question:
${question}

Conversation style:
- Answer the actual question first and focus on the relevant numbers only.
- Connect numbers when their contrast is genuinely useful.
- Do not repeat the complete profile unless explicitly asked.
- Use the first name sparingly, never automatically at the start.
- Sound warm, observant, intelligent, personal, and lightly mystical.
- Vary openings and sentence structure. Avoid report-like wording.
- A follow-up question is optional; ask at most one useful question.
- Do not repeatedly ask whether the user wants a deeper reading.
- For "yes" or "tell me more", continue the most recent thread from history.
- For "okay", respond naturally and briefly without repeating the profile.
- Treat Personal Month and Personal Day as short-term themes and never as guarantees of specific events.

Length:
${lengthRule}
Do not pad the response.

Safety:
- No medical diagnosis, death prediction, fertility prediction, guaranteed marriage date, guaranteed financial result, or legal certainty.
- Do not claim Numerology scientifically proves personality or destiny.
- Reply only in ${language}. For Hinglish, use Roman Hindi-English.
  `.trim();
}
