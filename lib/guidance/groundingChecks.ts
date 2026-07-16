import type { NumerologyProfile } from "../numerology/types";
import type { PalmAnalysisContext } from "../palmistry/prompt";
import type { DrawnTarotCard } from "../tarot/reading";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findIncorrectNumerologyClaims(
  answer: string,
  profile: NumerologyProfile,
) {
  const expected = [
    ["Life Path", profile.coreNumbers.lifePath.reducedNumber],
    ["Expression", profile.coreNumbers.expression.reducedNumber],
    ["Soul Urge", profile.coreNumbers.soulUrge.reducedNumber],
    ["Personality", profile.coreNumbers.personality.reducedNumber],
    ["Birthday", profile.coreNumbers.birthday.reducedNumber],
    ["Maturity", profile.coreNumbers.maturity.reducedNumber],
    ["Personal Year", profile.cycles.personalYear.reducedNumber],
    ["Personal Month", profile.cycles.personalMonth.reducedNumber],
    ["Personal Day", profile.cycles.personalDay.reducedNumber],
  ] as const;
  const issues: string[] = [];

  for (const [label, value] of expected) {
    const match = answer.match(
      new RegExp(
        `\\b${escapeRegExp(label)}(?:\\s+Number)?\\s*(?:is|=|:|of)\\s*(11|22|33|[1-9])\\b`,
        "i",
      ),
    );

    if (match && Number(match[1]) !== value) {
      issues.push(`${label} must remain ${value}, not ${match[1]}`);
    }
  }

  return issues;
}

export function findUnsupportedPalmClaims(
  answer: string,
  context: PalmAnalysisContext,
) {
  const lines = [
    ["Life Line", context.lifeLine],
    ["Head Line", context.headLine],
    ["Heart Line", context.heartLine],
    ["Fate Line", context.fateLine],
  ] as const;
  const issues: string[] = [];

  for (const [name, evidence] of lines) {
    if (evidence?.visible) continue;
    const positiveClaim = new RegExp(
      `\\byour ${escapeRegExp(name)}\\s+(?:is|looks|shows|runs|curves|starts|ends|suggests|indicates)\\b`,
      "i",
    );

    if (!positiveClaim.test(answer)) continue;

    const cautiousStatement = new RegExp(
      `${escapeRegExp(name)}[^.!?]{0,80}\\b(?:not visible|unclear|not clear|cannot|can't|insufficient|uncertain)\\b`,
      "i",
    );

    if (!cautiousStatement.test(answer)) {
      issues.push(`${name} is not confirmed in the saved palm evidence`);
    }
  }

  return issues;
}

export function findUnsupportedTarotCards({
  answer,
  selectedCards,
  allCardNames,
}: {
  answer: string;
  selectedCards: DrawnTarotCard[];
  allCardNames: string[];
}) {
  const selected = new Set(selectedCards.map((card) => card.name));

  return allCardNames.filter((name) => {
    if (selected.has(name)) return false;

    const exactName = escapeRegExp(name);
    const explicitCardReference = new RegExp(
      `(?:\\b(?:card|cards|spread|drawn|selected|upright|reversed)\\b[^.!?]{0,45}\\b${exactName}\\b|\\b${exactName}\\b[^.!?]{0,45}\\b(?:card|upright|reversed|position|spread)\\b)`,
    );
    const namedMajorArcana = name.startsWith("The ")
      ? new RegExp(`\\b${exactName}\\b`).test(answer)
      : false;

    return explicitCardReference.test(answer) || namedMajorArcana;
  });
}

export function findUnsupportedUnknownTimeAstrologyClaims(
  answer: string,
  birthTimeKnown: boolean,
) {
  if (birthTimeKnown) return [];

  const claims = [
    /\byour (?:ascendant|rising sign|lagna) is\b/i,
    /\b(?:planet|saturn|jupiter|mars|venus|mercury|moon|sun|rahu|ketu) is in your (?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th)) house\b/i,
    /\byour \d+(?:st|nd|rd|th) house\b/i,
  ];

  return claims.some((claim) => claim.test(answer))
    ? ["exact Ascendant or house claims require a known birth time"]
    : [];
}
