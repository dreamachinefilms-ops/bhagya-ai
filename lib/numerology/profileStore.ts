import { getSavedBirthDetails, getSavedUserProfile } from "@/lib/backend/birthDetailsMemory";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { calculateNumerologyProfile } from "./calculations.ts";
import {
  NUMEROLOGY_CALCULATION_VERSION,
  NUMEROLOGY_SYSTEM,
  type NumerologyProfile,
} from "./types.ts";

export type NumerologyProfileErrorCode =
  | "NAME_REQUIRED"
  | "DATE_OF_BIRTH_REQUIRED";

export class NumerologyProfileError extends Error {
  readonly code: NumerologyProfileErrorCode;

  constructor(code: NumerologyProfileErrorCode) {
    super(code);
    this.code = code;
    this.name = "NumerologyProfileError";
  }
}

type CachedNumerologyProfile = {
  source_full_name: string;
  source_date_of_birth: string;
  calculation_system: string;
  calculation_version: string;
  core_numbers: NumerologyProfile["coreNumbers"];
  name_breakdown: NumerologyProfile["nameBreakdown"];
};

export async function getNumerologyProfile({
  request,
  userId,
  timezone,
  now = new Date(),
}: {
  request: Request;
  userId: string;
  timezone: string;
  now?: Date;
}) {
  const [savedProfile, savedBirthDetails] = await Promise.all([
    getSavedUserProfile({ request, userId }),
    getSavedBirthDetails({ request, userId }),
  ]);
  const fullName = savedProfile?.fullName?.trim();
  const dateOfBirth = savedBirthDetails?.dateOfBirth?.trim();

  if (!fullName) throw new NumerologyProfileError("NAME_REQUIRED");
  if (!dateOfBirth) {
    throw new NumerologyProfileError("DATE_OF_BIRTH_REQUIRED");
  }

  const calculated = calculateNumerologyProfile({
    fullName,
    dateOfBirth,
    timezone,
    now,
  });
  const supabase = createSupabaseUserClient(request);
  const { data, error } = await supabase
    .from("numerology_profiles")
    .select(
      "source_full_name,source_date_of_birth,calculation_system,calculation_version,core_numbers,name_breakdown",
    )
    .eq("user_id", userId)
    .maybeSingle<CachedNumerologyProfile>();

  if (error) throw error;

  const isFresh = Boolean(
    data &&
      data.source_full_name === fullName &&
      data.source_date_of_birth === dateOfBirth &&
      data.calculation_system === NUMEROLOGY_SYSTEM &&
      data.calculation_version === NUMEROLOGY_CALCULATION_VERSION,
  );

  if (!isFresh) {
    const { error: upsertError } = await supabase.from("numerology_profiles").upsert(
      {
        user_id: userId,
        source_full_name: fullName,
        source_date_of_birth: dateOfBirth,
        calculation_system: calculated.system,
        calculation_version: calculated.calculationVersion,
        core_numbers: calculated.coreNumbers,
        name_breakdown: calculated.nameBreakdown,
        calculated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertError) throw upsertError;
  } else if (data) {
    calculated.coreNumbers = data.core_numbers;
    calculated.nameBreakdown = data.name_breakdown;
  }

  return {
    profile: calculated,
    firstName: savedProfile?.firstName?.trim() || fullName.split(/\s+/)[0] || null,
    cacheStatus: isFresh
      ? "hit" as const
      : data
        ? "updated" as const
        : "created" as const,
  };
}
