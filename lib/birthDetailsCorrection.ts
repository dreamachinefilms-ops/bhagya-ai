export type BirthDetailsCorrectionInput = {
  fullName: string;
  firstName: string;
  dateOfBirth: string;
  birthTime: string | null;
  birthTimeKnown: boolean;
  birthPlace: string;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const result = value.trim().replace(/\s+/g, " ");
  return result && result.length <= maxLength && !/[<>\u0000-\u001f\u007f]/.test(result) ? result : null;
}

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date < new Date();
}

export function validateBirthDetailsCorrection(value: unknown): BirthDetailsCorrectionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !["fullName", "dateOfBirth", "birthTime", "birthTimeKnown", "birthPlace"].includes(key))) return null;
  const fullName = cleanText(row.fullName, 80);
  const dateOfBirth = typeof row.dateOfBirth === "string" ? row.dateOfBirth.trim() : "";
  const birthTimeKnown = row.birthTimeKnown !== false;
  const birthTime = birthTimeKnown && typeof row.birthTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.birthTime.trim()) ? row.birthTime.trim() : null;
  const birthPlace = cleanText(row.birthPlace, 120);
  if (!fullName || !/\p{L}/u.test(fullName) || !validCalendarDate(dateOfBirth) || (birthTimeKnown && !birthTime) || !birthPlace || !/\p{L}/u.test(birthPlace)) return null;
  return { fullName, firstName: fullName.split(/\s+/)[0], dateOfBirth, birthTime, birthTimeKnown, birthPlace };
}
