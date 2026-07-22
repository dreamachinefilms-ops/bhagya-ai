import type { SavedBirthDetails, SavedUserProfile } from "@/lib/backend/birthDetailsMemory";
import type { DailyHoroscopeResult } from "./types";

const signs = ["Capricorn", "Aquarius", "Pisces", "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius"];
const cutoffs = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22];

export function sunSign(date: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  return day < cutoffs[month - 1] ? signs[month - 1] : signs[month % 12];
}

function pick(seed: string, values: string[]) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return values[Math.abs(hash) % values.length];
}

export function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function buildDailyGuidance(input: { profile: SavedUserProfile | null; birth: SavedBirthDetails; date: string }): DailyHoroscopeResult {
  const firstName = input.profile?.firstName?.trim() || input.profile?.fullName?.trim().split(/\s+/)[0] || input.birth.fullName?.trim().split(/\s+/)[0] || null;
  const sign = sunSign(input.birth.dateOfBirth);
  const seed = `${input.birth.dateOfBirth}|${input.date}`;
  const tone = pick(seed, ["steady attention", "patient momentum", "thoughtful initiative", "quiet confidence"]);
  const broad = input.birth.birthTimeKnown === false;
  return {
    date: input.date, firstName, zodiacSign: sign,
    overview: `${firstName ? `${firstName}, ` : ""}${sign ? `your ${sign} solar profile` : "your birth profile"} favours ${tone} today. Treat this as a reflective prompt: choose one priority and give it unhurried attention.`,
    themes: {
      career: "Clarify the outcome before adding more tasks. A measured follow-up can be more useful than a dramatic push.",
      love: "Make room for direct, kind communication. Ask rather than assuming what another person feels.",
      money: "Prefer practical review over impulse. Check the details of one pending expense or commitment.",
      wellbeing: "A simple rhythm—water, movement and a short pause away from screens—can help you reset.",
    },
    focusOfTheDay: pick(seed + "focus", ["Finish one meaningful task.", "Listen fully before responding.", "Create space for a calm decision."]),
    caution: pick(seed + "caution", ["Do not confuse urgency with importance.", "Avoid making promises before checking your capacity.", "Leave room for facts to challenge first impressions."]),
    favourableTime: null, luckyColour: null, luckyNumber: null,
    groundingNote: broad ? "Because your exact birth time is unavailable, today’s guidance is broader and does not use house-level timing." : "This reading uses your saved birth profile and solar sign. It does not claim live transit or house-level calculations.",
    generatedAt: new Date().toISOString(), sourceMode: "birth-profile-guidance",
  };
}
