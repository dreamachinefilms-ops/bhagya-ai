import type {
  NumberCalculation,
  NumerologyNumber,
  NumerologyProfile,
} from "./types.ts";
import {
  NUMEROLOGY_CALCULATION_VERSION,
  NUMEROLOGY_SYSTEM,
} from "./types.ts";

export const MASTER_NUMBERS = new Set([11, 22, 33]);

export const PYTHAGOREAN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
  J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9,
  S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8,
};

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const DEFAULT_TIMEZONE = "UTC";

export class NumerologyCalculationError extends Error {
  readonly code: "INVALID_NAME" | "INVALID_DATE" | "INVALID_TIMEZONE";

  constructor(code: "INVALID_NAME" | "INVALID_DATE" | "INVALID_TIMEZONE") {
    super(code);
    this.code = code;
    this.name = "NumerologyCalculationError";
  }
}

function isNumerologyNumber(value: number): value is NumerologyNumber {
  return (value >= 1 && value <= 9) || MASTER_NUMBERS.has(value);
}

function digitExpression(value: number) {
  return String(Math.abs(Math.trunc(value))).split("").join(" + ");
}

function reduceValue(value: number, preserveMasterNumbers = true) {
  let result = Math.abs(Math.trunc(value));
  const reductions: Array<{ from: number; to: number }> = [];

  while (
    result > 9 &&
    !(preserveMasterNumbers && MASTER_NUMBERS.has(result))
  ) {
    const next = String(result)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
    reductions.push({ from: result, to: next });
    result = next;
  }

  if (!isNumerologyNumber(result)) {
    throw new NumerologyCalculationError("INVALID_DATE");
  }

  return { result, reductions };
}

function formatReduction(value: number, preserveMasterNumbers = true) {
  const { result, reductions } = reduceValue(value, preserveMasterNumbers);
  const suffix = reductions
    .map(({ from, to }) => ` -> ${digitExpression(from)} = ${to}`)
    .join("");

  return { result, text: `${value}${suffix}` };
}

export function reduceNumber(
  value: number,
  preserveMasterNumbers = true,
  prefix?: string,
): NumberCalculation {
  const rawTotal = Math.abs(Math.trunc(value));
  const reduced = formatReduction(rawTotal, preserveMasterNumbers);

  return {
    rawTotal,
    reducedNumber: reduced.result,
    isMasterNumber: MASTER_NUMBERS.has(reduced.result),
    steps: [`${prefix ? `${prefix}: ` : ""}${reduced.text}`],
  };
}

export function normalizeNumerologyName(fullName: string) {
  return fullName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function parseDateOfBirth(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new NumerologyCalculationError("INVALID_DATE");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new NumerologyCalculationError("INVALID_DATE");
  }

  return { year, month, day };
}

export function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getCalendarDateInTimeZone(now: Date, timezone: string) {
  if (!isValidTimeZone(timezone)) {
    throw new NumerologyCalculationError("INVALID_TIMEZONE");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  return {
    year,
    month,
    day,
    isoDate: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function calculationFromParts(label: string, values: number[]) {
  const rawTotal = values.reduce((sum, value) => sum + value, 0);
  const reduced = formatReduction(rawTotal);
  return {
    rawTotal,
    reducedNumber: reduced.result,
    isMasterNumber: MASTER_NUMBERS.has(reduced.result),
    steps: [`${label}: ${values.join(" + ")} = ${reduced.text}`],
  } satisfies NumberCalculation;
}

function calculateNameValue(
  letters: Array<{ letter: string; value: number }>,
  label: string,
) {
  const rawTotal = letters.reduce((sum, item) => sum + item.value, 0);
  if (rawTotal <= 0) throw new NumerologyCalculationError("INVALID_NAME");
  const reduced = formatReduction(rawTotal);
  const expression = letters.map(({ letter, value }) => `${letter}(${value})`).join(" + ");

  return {
    rawTotal,
    reducedNumber: reduced.result,
    isMasterNumber: MASTER_NUMBERS.has(reduced.result),
    steps: [`${label}: ${expression} = ${reduced.text}`],
  } satisfies NumberCalculation;
}

export function calculateNumerologyProfile({
  fullName,
  dateOfBirth,
  timezone = DEFAULT_TIMEZONE,
  now = new Date(),
}: {
  fullName: string;
  dateOfBirth: string;
  timezone?: string;
  now?: Date;
}): NumerologyProfile {
  const normalizedName = normalizeNumerologyName(fullName);
  if (!normalizedName) throw new NumerologyCalculationError("INVALID_NAME");

  const birth = parseDateOfBirth(dateOfBirth);
  const current = getCalendarDateInTimeZone(now, timezone);
  const month = reduceNumber(birth.month);
  const day = reduceNumber(birth.day);
  const yearDigitTotal = String(birth.year)
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
  const year = reduceNumber(yearDigitTotal);
  const lifePathTotal =
    month.reducedNumber + day.reducedNumber + year.reducedNumber;
  const lifePathReduced = formatReduction(lifePathTotal);
  const lifePath: NumberCalculation = {
    rawTotal: lifePathTotal,
    reducedNumber: lifePathReduced.result,
    isMasterNumber: MASTER_NUMBERS.has(lifePathReduced.result),
    steps: [
      `Month: ${formatReduction(birth.month).text}`,
      `Day: ${formatReduction(birth.day).text}`,
      `Year: ${birth.year} -> ${digitExpression(birth.year)} = ${yearDigitTotal}${formatReduction(yearDigitTotal).text.slice(String(yearDigitTotal).length)}`,
      `Total: ${month.reducedNumber} + ${day.reducedNumber} + ${year.reducedNumber} = ${lifePathReduced.text}`,
    ],
  };

  // Version one treats A, E, I, O, U as vowels. Y is always a consonant.
  const letterValues = normalizedName.split("").map((letter) => ({
    letter,
    value: PYTHAGOREAN_VALUES[letter],
    category: VOWELS.has(letter) ? "vowel" as const : "consonant" as const,
  }));
  const vowelValues = letterValues.filter((item) => item.category === "vowel");
  const consonantValues = letterValues.filter(
    (item) => item.category === "consonant",
  );

  if (vowelValues.length === 0 || consonantValues.length === 0) {
    throw new NumerologyCalculationError("INVALID_NAME");
  }

  const expression = calculateNameValue(letterValues, "Expression");
  const soulUrge = calculateNameValue(vowelValues, "Soul Urge");
  const personality = calculateNameValue(consonantValues, "Personality");
  const birthday = reduceNumber(birth.day, true, "Birthday");
  const attitude = calculationFromParts("Attitude", [birth.month, birth.day]);
  const maturity = calculationFromParts("Maturity", [
    lifePath.reducedNumber,
    expression.reducedNumber,
  ]);

  const currentYearDigitTotal = String(current.year)
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
  const currentYearReduced = reduceNumber(currentYearDigitTotal);
  const personalYear = calculationFromParts("Personal Year", [
    month.reducedNumber,
    day.reducedNumber,
    currentYearReduced.reducedNumber,
  ]);
  personalYear.steps.unshift(
    `Calendar year ${current.year}: ${digitExpression(current.year)} = ${currentYearDigitTotal}${formatReduction(currentYearDigitTotal).text.slice(String(currentYearDigitTotal).length)}`,
  );
  const personalMonth = calculationFromParts("Personal Month", [
    personalYear.reducedNumber,
    current.month,
  ]);
  const personalDay = calculationFromParts("Personal Day", [
    personalMonth.reducedNumber,
    current.day,
  ]);

  return {
    system: NUMEROLOGY_SYSTEM,
    calculationVersion: NUMEROLOGY_CALCULATION_VERSION,
    source: { fullName, dateOfBirth, timezone },
    coreNumbers: {
      lifePath,
      expression,
      soulUrge,
      personality,
      birthday,
      attitude,
      maturity,
    },
    cycles: {
      personalYear,
      personalMonth,
      personalDay,
      calculatedForDate: current.isoDate,
    },
    nameBreakdown: {
      normalizedName,
      vowels: vowelValues.map(({ letter }) => letter),
      consonants: consonantValues.map(({ letter }) => letter),
      letterValues,
    },
  };
}
