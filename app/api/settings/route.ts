import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { getOrCreateUserPreferences, updateUserPreferences } from "@/lib/backend/userPreferences";
import { validatePreferencesPatch } from "@/lib/userPreferences";

const unauthorized = () => NextResponse.json({ error: "UNAUTHORIZED", message: "Your session has expired. Please sign in again." }, { status: 401 });

export async function GET(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return unauthorized();
  try {
    const supabase = createSupabaseUserClient(request);
    const { data: profile } = await supabase.from("profiles").select("preferred_language").eq("id", user.id).maybeSingle();
    const preferences = await getOrCreateUserPreferences({ request, userId: user.id, legacyLanguage: profile?.preferred_language });
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("[settings] load failed", error);
    return NextResponse.json({ error: "SETTINGS_LOAD_FAILED", message: "Your settings could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const patch = validatePreferencesPatch(body);
  if (!patch || Object.keys(patch).length === 0) return NextResponse.json({ error: "VALIDATION_ERROR", message: "One or more settings are invalid." }, { status: 400 });
  try {
    await getOrCreateUserPreferences({ request, userId: user.id });
    const preferences = await updateUserPreferences({ request, userId: user.id, patch });
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("[settings] save failed", error);
    return NextResponse.json({ error: "SETTINGS_SAVE_FAILED", message: "Your settings could not be saved. Please try again." }, { status: 500 });
  }
}
