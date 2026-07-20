import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { DEFAULT_USER_PREFERENCES, fromPreferenceRow, toPreferenceRow, type UserPreferences } from "@/lib/userPreferences";

export async function getOrCreateUserPreferences({ request, userId, legacyLanguage }: {
  request: Request; userId: string; legacyLanguage?: string | null;
}): Promise<UserPreferences> {
  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return fromPreferenceRow(data);
  const defaults = {
    ...DEFAULT_USER_PREFERENCES,
    language: legacyLanguage === "hindi" || legacyLanguage === "hi" ? "hi" as const : "en" as const,
  };
  const { data: created, error: createError } = await supabase.from("user_preferences")
    .upsert({ user_id: userId, ...toPreferenceRow(defaults) }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("*").single();
  if (createError) throw createError;
  return fromPreferenceRow(created);
}

export async function updateUserPreferences({ request, userId, patch }: {
  request: Request; userId: string; patch: Partial<UserPreferences>;
}) {
  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase.from("user_preferences")
    .update(toPreferenceRow(patch)).eq("user_id", userId).select("*").single();
  if (error) throw error;
  return fromPreferenceRow(data);
}
