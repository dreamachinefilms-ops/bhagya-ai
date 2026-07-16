import { getNumerologyMeaning } from "./meanings.ts";
import type {
  NumberCalculation,
  NumerologyBlueprintNumber,
  NumerologyBlueprintPayload,
  NumerologyProfile,
} from "./types.ts";
import { NUMEROLOGY_PROFILE_MESSAGE_TYPE } from "./types.ts";

function toBlueprintNumber(
  calculation: NumberCalculation,
): NumerologyBlueprintNumber {
  const meaning = getNumerologyMeaning(calculation.reducedNumber);
  return {
    number: calculation.reducedNumber,
    title: meaning.title,
    essence: meaning.essence,
    strengths: meaning.strengths,
    challenges: meaning.challenges,
    growthLesson: meaning.growthLesson,
    steps: calculation.steps,
  };
}

export function createNumerologyBlueprint(
  profile: NumerologyProfile,
  displayFirstName?: string | null,
): NumerologyBlueprintPayload {
  return {
    type: NUMEROLOGY_PROFILE_MESSAGE_TYPE,
    service: "numerology",
    system: profile.system,
    calculationVersion: profile.calculationVersion,
    calculatedForDate: profile.cycles.calculatedForDate,
    displayFirstName: displayFirstName || undefined,
    numbers: {
      lifePath: toBlueprintNumber(profile.coreNumbers.lifePath),
      expression: toBlueprintNumber(profile.coreNumbers.expression),
      soulUrge: toBlueprintNumber(profile.coreNumbers.soulUrge),
      personality: toBlueprintNumber(profile.coreNumbers.personality),
      birthday: toBlueprintNumber(profile.coreNumbers.birthday),
      attitude: toBlueprintNumber(profile.coreNumbers.attitude),
      maturity: toBlueprintNumber(profile.coreNumbers.maturity),
      personalYear: toBlueprintNumber(profile.cycles.personalYear),
      personalMonth: toBlueprintNumber(profile.cycles.personalMonth),
      personalDay: toBlueprintNumber(profile.cycles.personalDay),
    },
  };
}

export function serializeNumerologyBlueprint(
  profile: NumerologyProfile,
  displayFirstName?: string | null,
) {
  return JSON.stringify(createNumerologyBlueprint(profile, displayFirstName));
}

export function parseNumerologyBlueprint(
  content: string,
): NumerologyBlueprintPayload | null {
  if (!content.trim().startsWith("{")) return null;

  try {
    const value: unknown = JSON.parse(content);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !("type" in value) ||
      value.type !== NUMEROLOGY_PROFILE_MESSAGE_TYPE ||
      !("numbers" in value) ||
      !value.numbers ||
      typeof value.numbers !== "object" ||
      Array.isArray(value.numbers)
    ) {
      return null;
    }

    return value as NumerologyBlueprintPayload;
  } catch {
    return null;
  }
}
