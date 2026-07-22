import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { DEFAULT_USER_PREFERENCES, fromPreferenceRow, toPreferenceRow, type UserPreferences } from "@/lib/userPreferences";

const PREFERENCE_COLUMNS = "user_id,language,default_service,response_detail,timezone,use_chat_personalization,created_at,updated_at";

export async function getOrCreateUserPreferences({ request, userId, legacyLanguage }: {
  request: Request; userId: string; legacyLanguage?: string | null;
}): Promise<UserPreferences> {
  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase.from("user_preferences").select(PREFERENCE_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return fromPreferenceRow(data);
  const defaults = {
    ...DEFAULT_USER_PREFERENCES,
    language: legacyLanguage === "hindi" || legacyLanguage === "hi" ? "hi" as const : "en" as const,
  };
  const { data: created, error: createError } = await supabase.from("user_preferences")
    .upsert({ user_id: userId, ...toPreferenceRow(defaults) }, { onConflict: "user_id" })
    .select(PREFERENCE_COLUMNS).maybeSingle();
  if (createError) throw createError;
  return created ? fromPreferenceRow(created) : defaults;
}

export async function updateUserPreferences({ request, userId, patch }: {
  request: Request; userId: string; patch: Partial<UserPreferences>;
}) {
  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase.from("user_preferences")
    .upsert({ user_id: userId, ...toPreferenceRow(patch), updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select(PREFERENCE_COLUMNS).single();
  if (error) throw error;
  return fromPreferenceRow(data);
}
