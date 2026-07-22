import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { getOrCreateUserPreferences, updateUserPreferences } from "@/lib/backend/userPreferences";
import { validatePreferencesPatch } from "@/lib/userPreferences";

const unauthorized = () => NextResponse.json({ error: "AUTH_REQUIRED", message: "Your session has expired. Please sign in again." }, { status: 401 });

type SupabaseErrorLike = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };

function isSettingsStorageNotConfigured(error: unknown) {
  const code = (error as SupabaseErrorLike)?.code;
  return code === "PGRST205" || code === "PGRST204" || code === "42P01" || code === "42703";
}

function logSettingsFailure(operation: "preference select/default-row creation" | "preference upsert", error: unknown) {
  if (process.env.NODE_ENV === "production") return;
  const details = error as SupabaseErrorLike;
  console.error("[Settings API] Request failed", {
    operation,
    authenticated: true,
    databaseCode: typeof details?.code === "string" ? details.code : undefined,
    databaseMessage: typeof details?.message === "string" ? details.message : undefined,
    databaseDetails: typeof details?.details === "string" ? details.details : undefined,
    databaseHint: typeof details?.hint === "string" ? details.hint : undefined,
  });
}

export async function GET(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return unauthorized();
  try {
    const supabase = createSupabaseUserClient(request);
    const { data: profile } = await supabase.from("profiles").select("preferred_language").eq("id", user.id).maybeSingle();
    const preferences = await getOrCreateUserPreferences({ request, userId: user.id, legacyLanguage: profile?.preferred_language });
    return NextResponse.json({ preferences });
  } catch (error) {
    logSettingsFailure("preference select/default-row creation", error);
    if (isSettingsStorageNotConfigured(error)) return NextResponse.json({ error: "SETTINGS_STORAGE_NOT_CONFIGURED", message: "Settings storage is not configured yet." }, { status: 503 });
    return NextResponse.json({ error: "SETTINGS_LOAD_FAILED", message: "Your preferences could not be loaded." }, { status: 500 });
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
    logSettingsFailure("preference upsert", error);
    if (isSettingsStorageNotConfigured(error)) return NextResponse.json({ error: "SETTINGS_STORAGE_NOT_CONFIGURED", message: "Settings storage is not configured yet." }, { status: 503 });
    return NextResponse.json({ error: "SETTINGS_SAVE_FAILED", message: "Your settings could not be saved. Please try again." }, { status: 500 });
  }
}
