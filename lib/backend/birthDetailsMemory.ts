import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";

export type SavedBirthDetails = {
  id?: string;
  fullName?: string | null;
  dateOfBirth?: string | null;
  birthTime?: string | null;
  birthTimeKnown?: boolean | null;
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
  timezoneId?: string | null;
};

export type SavedUserProfile = {
  fullName?: string | null;
  firstName?: string | null;
};

function hasFiniteCoordinate(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function logSupabaseError(label: string, error: unknown) {
  const supabaseError = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  console.error(`[birth-details] ${label}`, {
    code:
      typeof supabaseError?.code === "string"
        ? supabaseError.code
        : undefined,
    message:
      typeof supabaseError?.message === "string"
        ? supabaseError.message
        : undefined,
    details: supabaseError?.details,
    hint: supabaseError?.hint,
  });
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
    logSupabaseError("fetch profile failed", error);
    throw error;
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
    logSupabaseError("profiles upsert failed", error);
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
      "id,full_name,date_of_birth,birth_time,birth_time_known,birth_place,latitude,longitude,timezone_offset,timezone_id"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError("fetch birth details failed", error);
    throw error;
  }

  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    dateOfBirth: data.date_of_birth,
    birthTime: data.birth_time,
    birthTimeKnown: data.birth_time_known,
    birthPlace: data.birth_place,
    latitude: data.latitude,
    longitude: data.longitude,
    timezoneOffset: data.timezone_offset,
    timezoneId: data.timezone_id,
  };
}

export async function createBirthDetails({
  request,
  userId,
  dateOfBirth,
  fullName,
  birthTime,
  birthTimeKnown,
  birthPlace,
  latitude,
  longitude,
  timezoneOffset,
  timezoneId,
}: {
  request: Request;
  userId: string;
  dateOfBirth: string;
  fullName: string;
  birthTime: string | null;
  birthTimeKnown: boolean;
  birthPlace: string;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
  timezoneId?: string | null;
}) {
  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase
    .from("user_birth_details")
    .insert(
    {
      user_id: userId,
      full_name: fullName,
      date_of_birth: dateOfBirth,
      birth_time: birthTime,
      birth_time_known: birthTimeKnown,
      birth_place: birthPlace,
      latitude,
      longitude,
      timezone_offset: timezoneOffset,
      timezone_id: timezoneId,
      updated_at: new Date().toISOString(),
    }
    )
    .select(
      "id,full_name,date_of_birth,birth_time,birth_time_known,birth_place,latitude,longitude,timezone_offset,timezone_id"
    )
    .single();

  if (error) {
    logSupabaseError("birth details upsert failed", error);
    throw error;
  }

  return data;
}

export function toBirthDetailsResponse(details: SavedBirthDetails | null) {
  if (!details) return null;

  return {
    dateOfBirth: details.dateOfBirth || "",
    fullName: details.fullName || "",
    birthTime: details.birthTime || "",
    birthTimeKnown: details.birthTimeKnown !== false,
    birthPlace: details.birthPlace || "",
    latitude: details.latitude ?? undefined,
    longitude: details.longitude ?? undefined,
    timezoneOffset: details.timezoneOffset ?? undefined,
    timezoneId: details.timezoneId ?? undefined,
  };
}
