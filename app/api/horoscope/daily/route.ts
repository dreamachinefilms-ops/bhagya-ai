import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { getSavedBirthDetails, getSavedUserProfile, isCompleteBirthDetails } from "@/lib/backend/birthDetailsMemory";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { isSupabaseSchemaUnavailable } from "@/lib/backend/supabaseErrors";
import { getOrCreateUserPreferences } from "@/lib/backend/userPreferences";
import { buildDailyGuidance, localDate } from "@/lib/horoscope/guidance";
import { DEFAULT_USER_PREFERENCES, isValidTimeZone } from "@/lib/userPreferences";

export async function POST(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED", message: "Please sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (Object.keys(input).some((key) => !["timezone", "language"].includes(key))) return NextResponse.json({ error: "VALIDATION_ERROR", message: "The request is invalid." }, { status: 400 });
  if (input.timezone !== undefined && (typeof input.timezone !== "string" || !isValidTimeZone(input.timezone))) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Choose a valid timezone." }, { status: 400 });
  if (input.language !== undefined && !["en", "hi"].includes(String(input.language))) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Choose a supported language." }, { status: 400 });
  try {
    const [profile, birth, preferences] = await Promise.all([
      getSavedUserProfile({ request, userId: user.id }),
      getSavedBirthDetails({ request, userId: user.id }),
      getOrCreateUserPreferences({ request, userId: user.id }).catch((error) => {
        if (!isSupabaseSchemaUnavailable(error)) throw error;
        return DEFAULT_USER_PREFERENCES;
      }),
    ]);
    if (!isCompleteBirthDetails(birth) || !birth) return NextResponse.json({ error: "BIRTH_PROFILE_REQUIRED", message: "Complete your birth profile to receive a personalised horoscope." }, { status: 428 });
    const timezone = preferences.timezone || (typeof input.timezone === "string" ? input.timezone : null) || birth.timezoneId || "Asia/Kolkata";
    const language = input.language === "hi" || input.language === "en" ? input.language : preferences.language;
    const date = localDate(timezone);
    const supabase = createSupabaseUserClient(request);
    const cached = await supabase.from("daily_horoscopes").select("result").eq("user_id", user.id).eq("horoscope_date", date).eq("language", language).maybeSingle();
    const cacheAvailable = !cached.error;
    if (cached.error && !isSupabaseSchemaUnavailable(cached.error)) throw cached.error;
    if (cached.data?.result) return NextResponse.json({ result: cached.data.result, cached: true });
    const result = buildDailyGuidance({ profile, birth, date });
    if (cacheAvailable) {
      const saved = await supabase.from("daily_horoscopes").upsert({ user_id: user.id, horoscope_date: date, timezone, language, result, source_mode: result.sourceMode, updated_at: new Date().toISOString() }, { onConflict: "user_id,horoscope_date,language" });
      if (saved.error && !isSupabaseSchemaUnavailable(saved.error)) throw saved.error;
    }
    return NextResponse.json({ result, cached: false, cacheAvailable });
  } catch (error) {
    console.error("[daily-horoscope] failed", error instanceof Error ? error.message : typeof error);
    return NextResponse.json({ error: "DAILY_HOROSCOPE_FAILED", message: "Your horoscope could not be generated. Please try again." }, { status: 500 });
  }
}
