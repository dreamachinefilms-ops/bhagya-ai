import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { calculateNumerologyProfile } from "./calculations.ts";
import {
  logNumerologyStage,
  logNumerologySupabaseError,
} from "./logging.ts";
import {
  NUMEROLOGY_CALCULATION_VERSION,
  NUMEROLOGY_SYSTEM,
  type NumerologyProfile,
} from "./types.ts";

export class NumerologyProfileError extends Error {
  readonly code = "BIRTH_PROFILE_INCOMPLETE";

  constructor() {
    super("BIRTH_PROFILE_INCOMPLETE");
    this.name = "NumerologyProfileError";
  }
}

export type NumerologyStorageErrorCode =
  | "BIRTH_PROFILE_LOAD_FAILED"
  | "PROFILE_LOAD_FAILED"
  | "PROFILE_SAVE_FAILED";

export class NumerologyStorageError extends Error {
  readonly code: NumerologyStorageErrorCode;
  readonly operation: string;
  readonly cause: unknown;

  constructor(code: NumerologyStorageErrorCode, operation: string, cause: unknown) {
    super(code);
    this.name = "NumerologyStorageError";
    this.code = code;
    this.operation = operation;
    this.cause = cause;
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

function stringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function loadBirthProfileSources({
  request,
  userId,
}: {
  request: Request;
  userId: string;
}) {
  const supabase = createSupabaseUserClient(request);
  const [birthResult, profileResult] = await Promise.all([
    supabase
      .from("user_birth_details")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);

  if (birthResult.error) {
    const query =
      "user_birth_details.select(*).eq(user_id,<authenticated-user>).order(updated_at desc).limit(1)";
    logNumerologySupabaseError({
      stage: "birth details load failed",
      query,
      error: birthResult.error,
    });
    throw new NumerologyStorageError(
      "BIRTH_PROFILE_LOAD_FAILED",
      query,
      birthResult.error,
    );
  }

  if (profileResult.error) {
    const query = "profiles.select(*).eq(id,<authenticated-user>)";
    logNumerologySupabaseError({
      stage: "profile name load failed",
      query,
      error: profileResult.error,
    });
    throw new NumerologyStorageError(
      "BIRTH_PROFILE_LOAD_FAILED",
      query,
      profileResult.error,
    );
  }

  const birthDetails = birthResult.data as Record<string, unknown> | null;
  const savedProfile = profileResult.data as Record<string, unknown> | null;
  const birthFullName = stringValue(birthDetails, "full_name");
  const profileFullName = stringValue(savedProfile, "full_name");
  const firstName =
    stringValue(savedProfile, "first_name") ||
    stringValue(birthDetails, "first_name");
  const lastName =
    stringValue(savedProfile, "last_name") ||
    stringValue(birthDetails, "last_name");
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  const fullName = birthFullName || profileFullName || combinedName;
  const dateOfBirth = stringValue(birthDetails, "date_of_birth");

  logNumerologyStage("birth details found", {
    found: Boolean(birthDetails),
    hasDateOfBirth: Boolean(dateOfBirth),
  });
  logNumerologyStage("full name found", {
    found: Boolean(fullName),
    source: birthFullName
      ? "user_birth_details"
      : profileFullName
        ? "profiles.full_name"
        : combinedName
          ? "profile name fields"
          : "missing",
  });

  if (!fullName || !dateOfBirth) throw new NumerologyProfileError();

  return {
    supabase,
    fullName,
    dateOfBirth,
    firstName: firstName || fullName.split(/\s+/)[0] || null,
    fullNameSource: birthFullName
      ? "user_birth_details" as const
      : profileFullName
        ? "profiles" as const
        : "profile-name-fields" as const,
  };
}

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
  const sources = await loadBirthProfileSources({ request, userId });
  const { supabase, fullName, dateOfBirth } = sources;
  const calculated = calculateNumerologyProfile({
    fullName,
    dateOfBirth,
    timezone,
    now,
  });
  logNumerologyStage("calculations completed", {
    calculationVersion: calculated.calculationVersion,
    calculatedForDate: calculated.cycles.calculatedForDate,
  });

  const cacheQuery =
    "numerology_profiles.select(source_full_name,source_date_of_birth,calculation_system,calculation_version,core_numbers,name_breakdown).eq(user_id,<authenticated-user>).limit(1)";
  const { data, error } = await supabase
    .from("numerology_profiles")
    .select(
      "source_full_name,source_date_of_birth,calculation_system,calculation_version,core_numbers,name_breakdown",
    )
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle<CachedNumerologyProfile>();

  if (error) {
    logNumerologySupabaseError({
      stage: "profile cache load failed",
      query: cacheQuery,
      error,
    });
    throw new NumerologyStorageError("PROFILE_LOAD_FAILED", cacheQuery, error);
  }

  logNumerologyStage("profile cache loaded", { found: Boolean(data) });
  const isFresh = Boolean(
    data &&
      data.source_full_name === fullName &&
      data.source_date_of_birth === dateOfBirth &&
      data.calculation_system === NUMEROLOGY_SYSTEM &&
      data.calculation_version === NUMEROLOGY_CALCULATION_VERSION,
  );

  if (!isFresh) {
    const cachePayload = {
      user_id: userId,
      source_full_name: fullName,
      source_date_of_birth: dateOfBirth,
      calculation_system: calculated.system,
      calculation_version: calculated.calculationVersion,
      core_numbers: calculated.coreNumbers,
      name_breakdown: calculated.nameBreakdown,
      calculated_at: new Date().toISOString(),
    };
    const saveQuery = data
      ? "numerology_profiles.update(<profile-fields>).eq(user_id,<authenticated-user>)"
      : "numerology_profiles.insert(<profile-fields>)";
    const saveResult = data
      ? await supabase
          .from("numerology_profiles")
          .update(cachePayload)
          .eq("user_id", userId)
      : await supabase.from("numerology_profiles").insert(cachePayload);

    if (saveResult.error) {
      logNumerologySupabaseError({
        stage: "profile cache save failed",
        query: saveQuery,
        error: saveResult.error,
      });
      throw new NumerologyStorageError(
        "PROFILE_SAVE_FAILED",
        saveQuery,
        saveResult.error,
      );
    }

    logNumerologyStage("profile upsert completed", {
      operation: data ? "update" : "insert",
    });
  } else if (data) {
    calculated.coreNumbers = data.core_numbers;
    calculated.nameBreakdown = data.name_breakdown;
  }

  return {
    profile: calculated,
    fullName: sources.fullName,
    firstName: sources.firstName,
    fullNameSource: sources.fullNameSource,
    cacheStatus: isFresh
      ? "hit" as const
      : data
        ? "updated" as const
        : "created" as const,
  };
}
