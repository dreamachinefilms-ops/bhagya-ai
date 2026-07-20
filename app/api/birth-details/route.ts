import { createClient, type User } from "@supabase/supabase-js";
import {
  getSavedBirthDetails,
  getSavedUserProfile,
  isCompleteBirthProfile,
  toBirthDetailsResponse,
  createBirthDetails,
  upsertUserProfile,
} from "@/lib/backend/birthDetailsMemory";
import {
  findBirthPlaceSuggestions,
  resolveBirthPlace,
} from "@/lib/prokerala/locationResolver";

const routeName = "api/birth-details";

type AuthResult =
  | {
      user: User;
    }
  | {
      response: Response;
    };

function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  if (details) {
    console.error(`[birth-details] ${code}`, details);
  }

  return Response.json(
    {
      success: false,
      error: code,
      code,
      message,
    },
    { status }
  );
}

function logSupabaseFailure(label: string, error: unknown) {
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

function isSchemaMismatch(error: unknown) {
  const supabaseError = error as {
    code?: unknown;
    message?: unknown;
  };
  const code = typeof supabaseError?.code === "string" ? supabaseError.code : "";
  const message =
    typeof supabaseError?.message === "string" ? supabaseError.message : "";

  return (
    code === "PGRST204" ||
    code === "42703" ||
    code === "42P01" ||
    /schema cache|column|relation|does not exist/i.test(message)
  );
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_ENV_MISSING");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function authenticateBirthProfileRequest(
  request: Request
): Promise<AuthResult> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      response: apiError(
        401,
        "AUTH_REQUIRED",
        "Please sign in again to continue."
      ),
    };
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return {
      response: apiError(
        401,
        "AUTH_REQUIRED",
        "Please sign in again to continue."
      ),
    };
  }

  let supabase;

  try {
    supabase = getSupabaseAuthClient();
  } catch (error) {
    return {
      response: apiError(
        500,
        "UNKNOWN_ERROR",
        "We could not prepare your profile right now. Please try again.",
        error
      ),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      response: apiError(
        401,
        "AUTH_REQUIRED",
        "Your session has expired. Please sign in again.",
        userError
      ),
    };
  }

  return { user };
}

function normalizeFullName(value: unknown) {
  if (typeof value !== "string") return null;

  const normalizedFullName = value.trim().replace(/\s+/g, " ");
  const firstName = normalizedFullName.split(" ").filter(Boolean)[0] || "";

  if (normalizedFullName.length < 2 || !firstName || !/\p{L}/u.test(firstName)) {
    return null;
  }

  return {
    fullName: normalizedFullName.slice(0, 80),
    firstName,
  };
}

function normalizeDateOfBirth(value: unknown) {
  if (typeof value !== "string") return null;

  const dateOfBirth = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);

  if (!dateOfBirth || Number.isNaN(birthDate.getTime()) || birthDate >= new Date()) {
    return null;
  }

  return dateOfBirth;
}

function normalizeBirthTime(value: unknown) {
  if (typeof value !== "string") return null;

  const birthTime = value.trim();

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime) ? birthTime : null;
}

function normalizeBirthTimeKnown(value: unknown) {
  return value === false ? false : true;
}

function normalizeBirthPlace(value: unknown) {
  if (typeof value !== "string") return null;

  const birthPlace = value
    .trim()
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ");

  if (birthPlace.length < 2 || birthPlace.length > 120) return null;
  if (!/[a-zA-Z]/.test(birthPlace)) return null;
  if (/^(unknown|n\/a|na|none|null|test)$/i.test(birthPlace)) return null;

  return birthPlace;
}

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const auth = await authenticateBirthProfileRequest(request);

    if ("response" in auth) return auth.response;

    userId = auth.user.id;

    let profile = null;
    let birthDetails = null;

    try {
      [profile, birthDetails] = await Promise.all([
        getSavedUserProfile({ request, userId: auth.user.id }),
        getSavedBirthDetails({
          request,
          userId: auth.user.id,
        }),
      ]);
    } catch (error) {
      logSupabaseFailure("profile read failed", error);

      return apiError(
        500,
        "BIRTH_DETAILS_LOAD_FAILED",
        "Your birth profile could not be loaded."
      );
    }

    return Response.json({
      success: true,
      exists: Boolean(birthDetails),
      locked: Boolean(birthDetails),
      complete: isCompleteBirthProfile({ profile, birthDetails }),
      profile: {
        fullName: birthDetails?.fullName || profile?.fullName || "",
        firstName: profile?.firstName || "",
      },
      birthDetails: toBirthDetailsResponse(birthDetails),
    });
  } catch (error) {
    return apiError(
      500,
      "BIRTH_DETAILS_LOAD_FAILED",
      "Your birth profile could not be loaded.",
      {
        routeName,
        userId,
        error,
      }
    );
  }
}

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const auth = await authenticateBirthProfileRequest(request);

    if ("response" in auth) return auth.response;

    userId = auth.user.id;

    const existingBirthDetails = await getSavedBirthDetails({
      request,
      userId: auth.user.id,
    });

    if (existingBirthDetails) {
      return Response.json(
        {
          error: "BIRTH_DETAILS_LOCKED",
          message: "Birth details cannot be changed after your profile has been created.",
        },
        { status: 403 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch (error) {
      return apiError(400, "UNKNOWN_ERROR", "Invalid JSON body.", error);
    }

    const requestBody =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};

    const normalizedName = normalizeFullName(requestBody.fullName);
    const dateOfBirth = normalizeDateOfBirth(requestBody.dateOfBirth);
    const birthTimeKnown = normalizeBirthTimeKnown(requestBody.birthTimeKnown);
    const birthTime = birthTimeKnown
      ? normalizeBirthTime(requestBody.birthTime)
      : null;
    const birthPlace = normalizeBirthPlace(requestBody.birthPlace);

    if (!normalizedName) {
      return apiError(422, "INVALID_NAME", "Please enter your full name.");
    }

    if (!dateOfBirth) {
      return apiError(
        422,
        "INVALID_DATE",
        "Please enter a valid date of birth."
      );
    }

    if (birthTimeKnown && !birthTime) {
      return apiError(
        422,
        "INVALID_TIME",
        "Please enter a valid birth time."
      );
    }

    if (!birthPlace) {
      return apiError(
        422,
        "LOCATION_NOT_FOUND",
        "We could not find that place. Please enter City, State, Country."
      );
    }

    const resolvedLocation = resolveBirthPlace(birthPlace);

    if (!resolvedLocation) {
      console.error("[birth-details] location resolution failed", {
        input: birthPlace,
        suggestions: findBirthPlaceSuggestions(birthPlace).map(
          (suggestion) => suggestion.displayName
        ),
      });

      return apiError(
        422,
        "LOCATION_NOT_FOUND",
        "We could not find that place. Please enter City, State, Country."
      );
    }

    try {
      await upsertUserProfile({
        request,
        userId: auth.user.id,
        email: auth.user.email,
        fullName: normalizedName.fullName,
        firstName: normalizedName.firstName,
      });
    } catch (error) {
      logSupabaseFailure("profiles upsert failed", error);

      return apiError(
        500,
        isSchemaMismatch(error)
          ? "DATABASE_SCHEMA_MISMATCH"
          : "PROFILE_SAVE_FAILED",
        isSchemaMismatch(error)
          ? "Your profile database needs an update before saving."
          : "We could not save your name. Please try again."
      );
    }

    try {
      await createBirthDetails({
        request,
        userId: auth.user.id,
        fullName: normalizedName.fullName,
        dateOfBirth,
        birthTime,
        birthTimeKnown,
        birthPlace:
          resolvedLocation.displayName || resolvedLocation.name || birthPlace,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        timezoneOffset: resolvedLocation.timezoneOffset,
        timezoneId: resolvedLocation.timezoneId,
      });
    } catch (error) {
      logSupabaseFailure("birth details upsert failed", error);

      if ((error as { code?: unknown })?.code === "23505") {
        return apiError(
          403,
          "BIRTH_DETAILS_LOCKED",
          "Birth details cannot be changed after your profile has been created."
        );
      }

      return apiError(
        500,
        isSchemaMismatch(error)
          ? "DATABASE_SCHEMA_MISMATCH"
          : "BIRTH_DETAILS_SAVE_FAILED",
        isSchemaMismatch(error)
          ? "Your birth profile database needs an update before saving."
          : "We could not save your birth details. Please try again."
      );
    }

    return Response.json({
      success: true,
      profile: {
        fullName: normalizedName.fullName,
        firstName: normalizedName.firstName,
      },
      birthDetails: {
        dateOfBirth,
        birthTime: birthTimeKnown ? birthTime : null,
        birthTimeKnown,
        birthPlace:
          resolvedLocation.displayName || resolvedLocation.name || birthPlace,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        timezoneOffset: resolvedLocation.timezoneOffset,
        timezoneId: resolvedLocation.timezoneId,
      },
    });
  } catch (error) {
    return apiError(
      500,
      "UNKNOWN_ERROR",
      "We could not save your birth profile right now. Please try again.",
      {
        routeName,
        userId,
        error,
      }
    );
  }
}
