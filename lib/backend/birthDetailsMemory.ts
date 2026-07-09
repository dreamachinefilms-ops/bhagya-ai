import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";

export type SavedBirthDetails = {
  id?: string;
  dateOfBirth?: string | null;
  birthTime?: string | null;
  birthTimeKnown?: boolean | null;
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
};

export type SavedUserProfile = {
  fullName?: string | null;
  firstName?: string | null;
};

function hasFiniteCoordinate(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

export function isCompleteBirthDetails(details: SavedBirthDetails | null) {
  const hasKnownTime =
    details?.birthTimeKnown === false || Boolean(details?.birthTime?.trim());

  return Boolean(
      details?.dateOfBirth?.trim() &&
      hasKnownTime &&
      details?.birthPlace?.trim() &&
      hasFiniteCoordinate(details?.latitude) &&
      hasFiniteCoordinate(details?.longitude) &&
      details?.timezoneOffset?.trim()
  );
}

export function isCompleteBirthProfile({
  profile,
  birthDetails,
}: {
  profile: SavedUserProfile | null;
  birthDetails: SavedBirthDetails | null;
}) {
  return Boolean(profile?.fullName?.trim() && isCompleteBirthDetails(birthDetails));
}

export async function getSavedUserProfile({
  request,
  userId,
}: {
  request: Request;
  userId: string;
}): Promise<SavedUserProfile | null> {
  const supabase = createSupabaseUserClient(request);

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name,first_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Fetch profile error:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    fullName: data.full_name,
    firstName: data.first_name,
  };
}

export async function upsertUserProfile({
  request,
  userId,
  email,
  fullName,
  firstName,
}: {
  request: Request;
  userId: string;
  email?: string | null;
  fullName: string;
  firstName: string;
}) {
  const supabase = createSupabaseUserClient(request);
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: email || null,
      full_name: fullName,
      first_name: firstName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("Upsert profile error:", {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
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
      "id,date_of_birth,birth_time,birth_time_known,birth_place,latitude,longitude,timezone_offset"
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
    birthTimeKnown: data.birth_time_known,
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
  birthTimeKnown,
  birthPlace,
  latitude,
  longitude,
  timezoneOffset,
}: {
  request: Request;
  userId: string;
  dateOfBirth: string;
  birthTime: string | null;
  birthTimeKnown: boolean;
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
      birth_time_known: birthTimeKnown,
      birth_place: birthPlace,
      latitude,
      longitude,
      timezone_offset: timezoneOffset,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Upsert birth details error:", {
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

export function toBirthDetailsResponse(details: SavedBirthDetails | null) {
  if (!details) return null;

  return {
    dateOfBirth: details.dateOfBirth || "",
    birthTime: details.birthTime || "",
    birthTimeKnown: details.birthTimeKnown !== false,
    birthPlace: details.birthPlace || "",
    latitude: details.latitude ?? undefined,
    longitude: details.longitude ?? undefined,
    timezoneOffset: details.timezoneOffset ?? undefined,
  };
}
