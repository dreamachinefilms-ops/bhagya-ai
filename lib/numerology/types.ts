export const NUMEROLOGY_SYSTEM = "pythagorean" as const;
export const NUMEROLOGY_CALCULATION_VERSION = "1.0.0";
export const NUMEROLOGY_PROFILE_MESSAGE_TYPE = "bhagya.numerology-profile";

export type NumerologyNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 22 | 33;

export type NumberCalculation = {
  rawTotal: number;
  reducedNumber: NumerologyNumber;
  isMasterNumber: boolean;
  steps: string[];
};

export type NumerologyMeaning = {
  number: NumerologyNumber;
  title: string;
  essence: string;
  strengths: string[];
  challenges: string[];
  careerThemes: string[];
  relationshipThemes: string[];
  growthLesson: string;
};

export type NumerologyProfile = {
  system: typeof NUMEROLOGY_SYSTEM;
  calculationVersion: string;
  source: {
    fullName: string;
    dateOfBirth: string;
    timezone: string;
  };
  coreNumbers: {
    lifePath: NumberCalculation;
    expression: NumberCalculation;
    soulUrge: NumberCalculation;
    personality: NumberCalculation;
    birthday: NumberCalculation;
    attitude: NumberCalculation;
    maturity: NumberCalculation;
  };
  cycles: {
    personalYear: NumberCalculation;
    personalMonth: NumberCalculation;
    personalDay: NumberCalculation;
    calculatedForDate: string;
  };
  nameBreakdown: {
    normalizedName: string;
    vowels: string[];
    consonants: string[];
    letterValues: Array<{
      letter: string;
      value: number;
      category: "vowel" | "consonant";
    }>;
  };
};

export type NumerologyBlueprintNumber = {
  number: NumerologyNumber;
  title: string;
  essence: string;
  strengths: string[];
  challenges: string[];
  growthLesson: string;
  steps: string[];
};

export type NumerologyBlueprintPayload = {
  type: typeof NUMEROLOGY_PROFILE_MESSAGE_TYPE;
  service: "numerology";
  system: typeof NUMEROLOGY_SYSTEM;
  calculationVersion: string;
  calculatedForDate: string;
  displayFirstName?: string;
  numbers: {
    lifePath: NumerologyBlueprintNumber;
    expression: NumerologyBlueprintNumber;
    soulUrge: NumerologyBlueprintNumber;
    personality: NumerologyBlueprintNumber;
    birthday: NumerologyBlueprintNumber;
    attitude: NumerologyBlueprintNumber;
    maturity: NumerologyBlueprintNumber;
    personalYear: NumerologyBlueprintNumber;
    personalMonth: NumerologyBlueprintNumber;
    personalDay: NumerologyBlueprintNumber;
  };
};

export type NumerologyResponseDepth = "brief" | "standard" | "deep";
