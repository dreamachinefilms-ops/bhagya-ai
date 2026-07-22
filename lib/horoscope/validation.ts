import type { SecondPersonInput } from "./types";

export function parseSecondPerson(value: unknown): SecondPersonInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fullName = typeof row.fullName === "string" ? row.fullName.trim().replace(/\s+/g, " ") : "";
  const dateOfBirth = typeof row.dateOfBirth === "string" ? row.dateOfBirth : "";
  const birthTimeKnown = row.birthTimeKnown !== false;
  const birthTime = typeof row.birthTime === "string" ? row.birthTime : "";
  const birthPlace = typeof row.birthPlace === "string" ? row.birthPlace.trim().replace(/\s+/g, " ") : "";
  if (!fullName || fullName.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`)) || dateOfBirth > new Date().toISOString().slice(0, 10) || !birthPlace || birthPlace.length > 160 || (birthTimeKnown && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime))) return null;
  return { fullName, dateOfBirth, birthTime: birthTimeKnown ? birthTime : "", birthTimeKnown, birthPlace };
}
