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

export function isCompleteBirthDetails(details: SavedBirthDetails | null) {
  return Boolean(
    details?.dateOfBirth?.trim() &&
      details?.birthTime?.trim() &&
      details?.birthPlace?.trim()
  );
}

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
  const { error } = await supabase.from("user_birth_details").upsert(
    {
      user_id: userId,
      date_of_birth: dateOfBirth,
      birth_time: birthTime,
      birth_place: birthPlace,
      latitude,
      longitude,
      timezone_offset: timezoneOffset,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Upsert birth details error:", error.message);
    throw new Error("Could not save birth details.");
  }
}

export function toBirthDetailsResponse(details: SavedBirthDetails | null) {
  if (!details) return null;

  return {
    dateOfBirth: details.dateOfBirth || "",
    birthTime: details.birthTime || "",
    birthPlace: details.birthPlace || "",
    latitude: details.latitude ?? undefined,
    longitude: details.longitude ?? undefined,
    timezoneOffset: details.timezoneOffset ?? undefined,
  };
}
