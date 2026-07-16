import {
  buildBhagyaCorePrompt,
  createGuidanceResponsePlan,
  type GuidanceEvidence,
  type GuidanceHistoryMessage,
  type GuidanceResponseDepth,
} from "../guidance/promptCore.ts";
import type { BirthDetails } from "../prokerala/birthDetails.ts";
import type { ResolvedLocation } from "../prokerala/locationResolver.ts";

export function buildAstrologyEvidence({
  birthDetails,
  location,
  prokeralaData,
}: {
  birthDetails: BirthDetails;
  location: ResolvedLocation;
  prokeralaData: unknown;
}): GuidanceEvidence[] {
  const evidence: GuidanceEvidence[] = [
    {
      source: "saved date of birth",
      value: birthDetails.dateOfBirth || "not supplied",
    },
    {
      source: "saved birth place",
      value:
        location.displayName ||
        location.name ||
        birthDetails.birthPlace ||
        "not supplied",
    },
    {
      source: "birth time precision",
      value:
        birthDetails.birthTimeKnown === false
          ? "exact birth time unknown"
          : `saved birth time ${birthDetails.birthTime}`,
    },
  ];

  if (prokeralaData && typeof prokeralaData === "object") {
    evidence.push({
      source: "astrology provider",
      value: "Prokerala kundli/chart payload is available",
    });
  }

  return evidence;
}

export function buildAstrologyPrompt({
  language,
  languageCode,
  conversationText,
  historyMessages,
  currentQuestion,
  birthDetails,
  location,
  prokeralaData,
  firstName,
  responseDepth,
}: {
  language: string;
  languageCode: string;
  conversationText: string;
  historyMessages: GuidanceHistoryMessage[];
  currentQuestion: string;
  birthDetails: BirthDetails;
  location: ResolvedLocation;
  prokeralaData: unknown;
  firstName?: string | null;
  responseDepth: GuidanceResponseDepth;
}) {
  const birthTimeKnown = birthDetails.birthTimeKnown !== false;
  const evidence = buildAstrologyEvidence({
    birthDetails,
    location,
    prokeralaData,
  });
  const plan = createGuidanceResponsePlan({
    service: "astrology",
    userMessage: currentQuestion,
    relevantEvidence: evidence,
    history: historyMessages,
    useFirstName: Boolean(firstName),
    responseLength: responseDepth,
  });

  return {
    evidence,
    instructions: `
${buildBhagyaCorePrompt({
  service: "astrology",
  language,
  firstName,
  plan,
})}

Astrology language code: ${languageCode}

Verified saved birth profile:
${JSON.stringify(birthDetails, null, 2)}

Resolved birth location:
${JSON.stringify(location, null, 2)}

Verified Prokerala kundli/chart response:
${JSON.stringify(prokeralaData, null, 2)}

Recent active Astrology conversation:
${conversationText}

Astrology grounding rules:
- Answer the current question first using actual factors present in the supplied chart response.
- Prefer relevant placements, signs, nakshatra, dasha, houses, yogas, or current chart factors only when they are explicitly present.
- Do not manufacture an Ascendant, Moon sign, house, yoga, dasha, transit, or planetary placement.
- If provider data is too limited for the question, say that clearly and base the answer only on the saved birth profile and broad traditional interpretation.
- ${
      birthTimeKnown
        ? "The saved birth time is available; still present timing as indicative rather than guaranteed."
        : "The exact birth time is unknown. Noon is only a calculation fallback: do not make confident Ascendant, house, Manglik, yoga, or exact timing claims, and state the limitation when relevant."
    }
- Do not use vague transformation language when a specific chart factor is available.
- Do not repeat a full chart overview in response to a narrow follow-up.
    `.trim(),
  };
}
