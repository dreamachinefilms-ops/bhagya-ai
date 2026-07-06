import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";

export type SavedBirthDetails = {
  id?: string;
  dateOfBirth?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
};

export async function getSavedBirthDetails({
  request,
  userId,
}: {
  request: Request;
  userId: string;
}): Promise<SavedBirthDetails | null> {
  const supabase = createSupabaseUserClient(request);

  const { data, error } = await supabase
    .from("user_birth_details")
    .select(
      "id,date_of_birth,birth_time,birth_place,latitude,longitude,timezone_offset"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Fetch birth details error:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    dateOfBirth: data.date_of_birth,
    birthTime: data.birth_time,
    birthPlace: data.birth_place,
    latitude: data.latitude,
    longitude: data.longitude,
    timezoneOffset: data.timezone_offset,
  };
}

export async function upsertBirthDetails({
  request,
  userId,
  dateOfBirth,
  birthTime,
  birthPlace,
  latitude,
  longitude,
  timezoneOffset,
}: {
  request: Request;
  userId: string;
  dateOfBirth: string;
  birthTime: string;
  birthPlace: string;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
}) {
  const supabase = createSupabaseUserClient(request);
  const existing = await getSavedBirthDetails({ request, userId });
  const values = {
    date_of_birth: dateOfBirth,
    birth_time: birthTime,
    birth_place: birthPlace,
    latitude,
    longitude,
    timezone_offset: timezoneOffset,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("user_birth_details")
      .update(values)
      .eq("id", existing.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Update birth details error:", error.message);
    }

    return;
  }

  const { error } = await supabase.from("user_birth_details").insert({
    user_id: userId,
    ...values,
  });

  if (error) {
    console.error("Insert birth details error:", error.message);
  }
}
