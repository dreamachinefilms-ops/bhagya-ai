import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  getSavedBirthDetails,
  getSavedUserProfile,
  isCompleteBirthProfile,
  toBirthDetailsResponse,
  upsertBirthDetails,
  upsertUserProfile,
} from "@/lib/backend/birthDetailsMemory";
import { safeErrorResponse } from "@/lib/backend/errors";
import {
  findBirthPlaceSuggestions,
  resolveBirthPlace,
} from "@/lib/prokerala/locationResolver";

const routeName = "api/birth-details";

function unauthorizedResponse() {
  return NextResponse.json(
    { code: "UNAUTHORIZED", message: "Please sign in again to continue." },
    { status: 401 }
  );
}

function requestError({
  code,
  message,
  field,
  status = 400,
  suggestions,
}: {
  code: string;
  message: string;
  field?: string;
  status?: number;
  suggestions?: string[];
}) {
  return NextResponse.json(
    { code, message, field, suggestions },
    { status }
  );
}

function validationError(message: string, field?: string) {
  return requestError({
    code: "VALIDATION_ERROR",
    message,
    field,
    status: 400,
  });
}

function normalizeDateOfBirth(value: unknown) {
  if (typeof value !== "string") return null;

  const dateOfBirth = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  if (parsed.getTime() >= todayUtc) return null;

  return dateOfBirth;
}

function normalizeBirthTime(value: unknown) {
  if (typeof value !== "string") return null;

  const birthTime = value.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(birthTime);

  return match ? birthTime : null;
}

function normalizeFullName(value: unknown) {
  if (typeof value !== "string") return null;

  const fullName = value.replace(/\s+/g, " ").trim();

  if (fullName.length < 2 || fullName.length > 80) return null;
  if (!/\p{L}/u.test(fullName)) return null;

  return fullName;
}

function getFirstName(fullName: string) {
  return fullName.split(/\s+/)[0] || fullName;
}

function normalizeBirthPlace(value: unknown) {
  if (typeof value !== "string") return null;

  const birthPlace = value.replace(/\s+/g, " ").trim();

  if (birthPlace.length < 2 || birthPlace.length > 120) return null;
  if (!/[a-zA-Z]/.test(birthPlace)) return null;
  if (/^(unknown|n\/a|na|none|null|test)$/i.test(birthPlace)) return null;

  return birthPlace;
}

function normalizeBirthTimeKnown(value: unknown) {
  return value === false ? false : true;
}

function logSaveFailure(error: unknown, userId?: string) {
  const maybeError = error as { code?: unknown; message?: unknown };

  console.error("Birth profile save failed:", {
    userId,
    code: typeof maybeError?.code === "string" ? maybeError.code : undefined,
    message:
      typeof maybeError?.message === "string" ? maybeError.message : undefined,
  });
}

function saveFailedResponse(error: unknown, userId?: string) {
  logSaveFailure(error, userId);

  return NextResponse.json(
    {
      code: "SAVE_FAILED",
      message:
        "We could not save your birth profile right now. Please try again.",
    },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;
    const [profile, birthDetails] = await Promise.all([
      getSavedUserProfile({ request, userId: user.id }),
      getSavedBirthDetails({
        request,
        userId: user.id,
      }),
    ]);

    return NextResponse.json({
      complete: isCompleteBirthProfile({ profile, birthDetails }),
      profile: {
        fullName: profile?.fullName || "",
        firstName: profile?.firstName || "",
      },
      birthDetails: toBirthDetailsResponse(birthDetails),
    });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return validationError("Invalid JSON body.");
    }

    const requestBody =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const fullName = normalizeFullName(requestBody.fullName);
    const dateOfBirth = normalizeDateOfBirth(requestBody.dateOfBirth);
    const birthTimeKnown = normalizeBirthTimeKnown(requestBody.birthTimeKnown);
    const birthTime = birthTimeKnown
      ? normalizeBirthTime(requestBody.birthTime)
      : null;
    const birthPlace = normalizeBirthPlace(requestBody.birthPlace);

    if (!fullName) {
      return validationError("Please enter your full name.", "fullName");
    }

    if (!dateOfBirth) {
      return validationError("Please enter a valid past date of birth.", "dateOfBirth");
    }

    if (birthTimeKnown && !birthTime) {
      return validationError("Please enter a valid birth time.", "birthTime");
    }

    if (!birthPlace) {
      return validationError(
        "Please enter your birth place as City, State, Country.",
        "birthPlace"
      );
    }

    const location = resolveBirthPlace(birthPlace);

    if (!location) {
      return requestError({
        code: "LOCATION_NOT_FOUND",
        message:
          "We could not locate that birth place. Please enter a clear city, state, and country.",
        field: "birthPlace",
        status: 422,
        suggestions: findBirthPlaceSuggestions(birthPlace).map(
          (suggestion) => suggestion.displayName
        ),
      });
    }

    const firstName = getFirstName(fullName);

    try {
      await upsertUserProfile({
        request,
        userId: user.id,
        email: user.email,
        fullName,
        firstName,
      });

      await upsertBirthDetails({
        request,
        userId: user.id,
        dateOfBirth,
        birthTime,
        birthTimeKnown,
        birthPlace: location.displayName || location.name || birthPlace,
        latitude: location.latitude,
        longitude: location.longitude,
        timezoneOffset: location.timezoneOffset,
      });
    } catch (error) {
      return saveFailedResponse(error, user.id);
    }

    const [savedProfile, savedBirthDetails] = await Promise.all([
      getSavedUserProfile({ request, userId: user.id }),
      getSavedBirthDetails({
        request,
        userId: user.id,
      }),
    ]);

    return NextResponse.json({
      success: true,
      complete: isCompleteBirthProfile({
        profile: savedProfile,
        birthDetails: savedBirthDetails,
      }),
      profile: {
        fullName: savedProfile?.fullName || fullName,
        firstName: savedProfile?.firstName || firstName,
      },
      birthDetails: toBirthDetailsResponse(savedBirthDetails),
    });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}
