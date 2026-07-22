import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { validateBirthDetailsCorrection } from "@/lib/birthDetailsCorrection";
import { resolveBirthPlace } from "@/lib/prokerala/locationResolver";

type CorrectedRow = { full_name: string | null; date_of_birth: string | null; birth_time: string | null; birth_time_known: boolean; birth_place: string | null; correction_used: boolean; corrected_at: string | null };

export async function PATCH(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED", message: "Please sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const input = validateBirthDetailsCorrection(body);
  if (!input) return NextResponse.json({ error: "INVALID_BIRTH_DETAILS", message: "Please check the birth details and try again." }, { status: 400 });
  const location = resolveBirthPlace(input.birthPlace);
  if (!location) return NextResponse.json({ error: "INVALID_BIRTH_DETAILS", message: "Please check the birth details and try again." }, { status: 400 });
  try {
    const supabase = createSupabaseUserClient(request);
    const existing = await supabase.from("user_birth_details").select("id,correction_used").eq("user_id", user.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return NextResponse.json({ error: "BIRTH_PROFILE_NOT_FOUND", message: "Complete your birth profile before making a correction." }, { status: 404 });
    if (existing.data.correction_used) return NextResponse.json({ error: "BIRTH_DETAILS_PERMANENTLY_LOCKED", message: "Your one-time birth-detail correction has already been used." }, { status: 403 });
    const { data, error } = await supabase.rpc("correct_birth_details_once", {
      p_full_name: input.fullName, p_first_name: input.firstName, p_date_of_birth: input.dateOfBirth,
      p_birth_time: input.birthTime, p_birth_time_known: input.birthTimeKnown,
      p_birth_place: location.displayName || location.name || input.birthPlace,
      p_latitude: location.latitude, p_longitude: location.longitude,
      p_timezone_offset: location.timezoneOffset, p_timezone_id: location.timezoneId || null,
    }).single<CorrectedRow>();
    if (error) {
      if (/BIRTH_PROFILE_NOT_FOUND/.test(error.message)) return NextResponse.json({ error: "BIRTH_PROFILE_NOT_FOUND", message: "Complete your birth profile before making a correction." }, { status: 404 });
      if (/BIRTH_DETAILS_CORRECTION_UNAVAILABLE/.test(error.message)) return NextResponse.json({ error: "BIRTH_DETAILS_PERMANENTLY_LOCKED", message: "Your one-time birth-detail correction has already been used." }, { status: 403 });
      throw error;
    }
    return NextResponse.json({ birthDetails: { fullName: data.full_name || input.fullName, dateOfBirth: data.date_of_birth || input.dateOfBirth, birthTime: data.birth_time || "", birthTimeKnown: data.birth_time_known, birthPlace: data.birth_place || input.birthPlace, correctionUsed: data.correction_used, correctedAt: data.corrected_at }, locked: true, correctionRemaining: false });
  } catch (error) {
    console.error("[birth-details-correction] failed", error instanceof Error ? error.message : typeof error);
    return NextResponse.json({ error: "BIRTH_DETAILS_CORRECTION_FAILED", message: "Your birth details could not be corrected. Your correction opportunity has not been used." }, { status: 500 });
  }
}
