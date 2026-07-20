import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { getUserFirstName } from "@/lib/userPreferences";
import { getSavedBirthDetails } from "@/lib/backend/birthDetailsMemory";

function validName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 100 && !/[<>]/.test(name) ? name : null;
}

export async function GET(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED", message: "Your session has expired. Please sign in again." }, { status: 401 });
  try {
    const supabase = createSupabaseUserClient(request);
    const [{ data: profile, error }, birthDetails] = await Promise.all([
      supabase.from("profiles").select("full_name,first_name,created_at").eq("id", user.id).maybeSingle(),
      getSavedBirthDetails({ request, userId: user.id }),
    ]);
    if (error) throw error;
    const fullName = profile?.full_name || user.user_metadata?.full_name || "";
    return NextResponse.json({ profile: { fullName, firstName: getUserFirstName({ preferredFirstName: profile?.first_name, fullName }), email: user.email || "", createdAt: profile?.created_at || user.created_at, birthDetails: birthDetails ? { fullName: birthDetails.fullName || fullName, dateOfBirth: birthDetails.dateOfBirth || "", birthTime: birthDetails.birthTime || "", birthTimeKnown: birthDetails.birthTimeKnown !== false, birthPlace: birthDetails.birthPlace || "" } : null } });
  } catch (error) {
    console.error("[profile] load failed", error);
    return NextResponse.json({ error: "PROFILE_LOAD_FAILED", message: "Your profile could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED", message: "Your session has expired. Please sign in again." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["fullName", "firstName"].includes(key))) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Profile details are invalid." }, { status: 400 });
  const record = body as Record<string, unknown>;
  const fullName = validName(record.fullName);
  const firstName = validName(record.firstName);
  if (!fullName || !firstName) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Enter a valid name of 100 characters or fewer." }, { status: 400 });
  try {
    const supabase = createSupabaseUserClient(request);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, email: user.email || null, full_name: fullName, first_name: getUserFirstName({ preferredFirstName: firstName, fullName }), updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw error;
    return NextResponse.json({ profile: { fullName, firstName: getUserFirstName({ preferredFirstName: firstName, fullName }), email: user.email || "", createdAt: user.created_at } });
  } catch (error) {
    console.error("[profile] save failed", error);
    return NextResponse.json({ error: "PROFILE_SAVE_FAILED", message: "Your profile could not be updated. Please try again." }, { status: 500 });
  }
}
