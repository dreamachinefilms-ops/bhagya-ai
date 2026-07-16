import { NUMEROLOGY_MEANINGS } from "./meanings.ts";
import {
  buildBhagyaCorePrompt,
  createGuidanceResponsePlan,
  selectGuidanceResponseDepth,
  type GuidanceEvidence,
  type GuidanceHistoryMessage,
} from "../guidance/promptCore.ts";
import type {
  NumerologyProfile,
  NumerologyResponseDepth,
} from "./types.ts";

export function selectNumerologyResponseDepth(
  message: string,
): NumerologyResponseDepth {
  if (
    /\b(heartbroken|grieving|feel lost|deeply worried|life-changing)\b/i.test(
      message,
    )
  ) {
    return "deep";
  }

  return selectGuidanceResponseDepth(message);
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
  historyMessages,
  question,
}: {
  profile: NumerologyProfile;
  firstName?: string | null;
  language: string;
  languageCode: string;
  history: string;
  historyMessages: GuidanceHistoryMessage[];
  question: string;
}) {
  const depth = selectNumerologyResponseDepth(question);

  const toPromptNumber = (calculation: {
    reducedNumber: number;
    isMasterNumber: boolean;
  }) => ({
    number: calculation.reducedNumber,
    isMasterNumber: calculation.isMasterNumber,
  });
  const profileNumbers = [
    ...Object.values(profile.coreNumbers),
    profile.cycles.personalYear,
    profile.cycles.personalMonth,
    profile.cycles.personalDay,
  ];
  const suppliedMeanings = Object.fromEntries(
    [...new Set(profileNumbers.map((item) => item.reducedNumber))].map(
      (number) => [number, NUMEROLOGY_MEANINGS[number]],
    ),
  );
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
    meanings: suppliedMeanings,
  };
  const evidence = buildNumerologyEvidence(profile, question);
  const plan = createGuidanceResponsePlan({
    service: "numerology",
    userMessage: question,
    relevantEvidence: evidence,
    history: historyMessages,
    useFirstName: Boolean(firstName),
    responseLength: depth,
  });

  return {
    depth,
    evidence,
    instructions: `
${buildBhagyaCorePrompt({
  service: "numerology",
  language,
  firstName,
  plan,
})}

Numerology language code: ${languageCode}

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
- For "yes" or "tell me more", continue the most recent thread from history.
- For "okay", respond naturally and briefly without repeating the profile.
- Treat Personal Month and Personal Day as short-term themes and never as guarantees of specific events.
- State calculated values directly, for example "Your calculated Life Path is 7"; never hedge about whether the saved number might be different.

Safety:
- No medical diagnosis, death prediction, fertility prediction, guaranteed marriage date, guaranteed financial result, or legal certainty.
- Do not claim Numerology scientifically proves personality or destiny.
- Reply only in ${language}. For Hinglish, use Roman Hindi-English.
  `.trim(),
  };
}

export function buildNumerologyEvidence(
  profile: NumerologyProfile,
  question: string,
): GuidanceEvidence[] {
  const values = profile.coreNumbers;
  const cycles = profile.cycles;
  const normalized = question.toLowerCase();
  const evidence: GuidanceEvidence[] = [];
  const add = (source: string, value: number) =>
    evidence.push({ source, value: String(value), confidence: 1 });

  if (/career|job|work|business|money|finance/.test(normalized)) {
    add("calculated Life Path", values.lifePath.reducedNumber);
    add("calculated Expression", values.expression.reducedNumber);
    add("calculated Personality", values.personality.reducedNumber);
    add("calculated Personal Year", cycles.personalYear.reducedNumber);
  } else if (/love|relationship|marriage|partner|emotion/.test(normalized)) {
    add("calculated Soul Urge", values.soulUrge.reducedNumber);
    add("calculated Personality", values.personality.reducedNumber);
    add("calculated Life Path", values.lifePath.reducedNumber);
  } else if (/timing|year|month|day|when/.test(normalized)) {
    add("calculated Personal Year", cycles.personalYear.reducedNumber);
    add("calculated Personal Month", cycles.personalMonth.reducedNumber);
    add("calculated Personal Day", cycles.personalDay.reducedNumber);
  } else {
    add("calculated Life Path", values.lifePath.reducedNumber);
    add("calculated Expression", values.expression.reducedNumber);
    add("calculated Personal Year", cycles.personalYear.reducedNumber);
  }

  return evidence;
}
