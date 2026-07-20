import type { GuidanceResponseDepth } from "@/lib/guidance/promptCore";

export type BhagyaLanguage = "en" | "hi";
export type BhagyaService = "astrology" | "numerology" | "tarot" | "palmistry";
export type ResponseDetail = "concise" | "balanced" | "detailed";

export type UserPreferences = {
  language: BhagyaLanguage;
  defaultService: BhagyaService;
  responseDetail: ResponseDetail;
  timezone: string | null;
  useChatPersonalization: boolean;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  language: "en",
  defaultService: "astrology",
  responseDetail: "balanced",
  timezone: null,
  useChatPersonalization: true,
};

const languages = new Set<BhagyaLanguage>(["en", "hi"]);
const services = new Set<BhagyaService>(["astrology", "numerology", "tarot", "palmistry"]);
const details = new Set<ResponseDetail>(["concise", "balanced", "detailed"]);

export function getUserFirstName(input: {
  preferredFirstName?: string | null;
  fullName?: string | null;
}): string | null {
  const preferred = input.preferredFirstName?.trim();
  if (preferred) return preferred.split(/\s+/)[0] || null;
  const fullName = input.fullName?.trim();
  return fullName ? fullName.split(/\s+/)[0] || null : null;
}

export function isValidTimeZone(value: string) {
  if (!value || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validatePreferencesPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowed = new Set(["language", "defaultService", "responseDetail", "timezone", "useChatPersonalization"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  const patch: Partial<UserPreferences> = {};
  if ("language" in record) {
    if (!languages.has(record.language as BhagyaLanguage)) return null;
    patch.language = record.language as BhagyaLanguage;
  }
  if ("defaultService" in record) {
    if (!services.has(record.defaultService as BhagyaService)) return null;
    patch.defaultService = record.defaultService as BhagyaService;
  }
  if ("responseDetail" in record) {
    if (!details.has(record.responseDetail as ResponseDetail)) return null;
    patch.responseDetail = record.responseDetail as ResponseDetail;
  }
  if ("timezone" in record) {
    if (record.timezone !== null && (typeof record.timezone !== "string" || !isValidTimeZone(record.timezone))) return null;
    patch.timezone = record.timezone as string | null;
  }
  if ("useChatPersonalization" in record) {
    if (typeof record.useChatPersonalization !== "boolean") return null;
    patch.useChatPersonalization = record.useChatPersonalization;
  }
  return patch;
}

export function preferenceToResponseDepth(preference: ResponseDetail, message: string): GuidanceResponseDepth {
  if (/\b(in detail|detailed|go deeper|full report|explain everything)\b/i.test(message)) return "deep";
  if (/\b(short answer|briefly|be concise|keep it short)\b/i.test(message)) return "brief";
  return preference === "concise" ? "brief" : preference === "detailed" ? "deep" : "standard";
}

export function fromPreferenceRow(row: Record<string, unknown>): UserPreferences {
  return {
    language: languages.has(row.language as BhagyaLanguage) ? row.language as BhagyaLanguage : "en",
    defaultService: services.has(row.default_service as BhagyaService) ? row.default_service as BhagyaService : "astrology",
    responseDetail: details.has(row.response_detail as ResponseDetail) ? row.response_detail as ResponseDetail : "balanced",
    timezone: typeof row.timezone === "string" && isValidTimeZone(row.timezone) ? row.timezone : null,
    useChatPersonalization: row.use_chat_personalization !== false,
  };
}

export function toPreferenceRow(preferences: UserPreferences | Partial<UserPreferences>) {
  return {
    ...(preferences.language !== undefined && { language: preferences.language }),
    ...(preferences.defaultService !== undefined && { default_service: preferences.defaultService }),
    ...(preferences.responseDetail !== undefined && { response_detail: preferences.responseDetail }),
    ...(preferences.timezone !== undefined && { timezone: preferences.timezone }),
    ...(preferences.useChatPersonalization !== undefined && { use_chat_personalization: preferences.useChatPersonalization }),
  };
}
