import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  getSavedBirthDetails,
  isCompleteBirthDetails,
  toBirthDetailsResponse,
  upsertBirthDetails,
} from "@/lib/backend/birthDetailsMemory";
import { safeErrorResponse } from "@/lib/backend/errors";
import { resolveBirthPlace } from "@/lib/prokerala/locationResolver";

const routeName = "api/birth-details";

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Please login to continue." },
    { status: 401 }
  );
}

function validationError(message: string, field?: string) {
  return NextResponse.json(
    { error: "VALIDATION_ERROR", message, field },
    { status: 400 }
  );
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

function normalizeBirthPlace(value: unknown) {
  if (typeof value !== "string") return null;

  const birthPlace = value.replace(/\s+/g, " ").trim();

  if (birthPlace.length < 2 || birthPlace.length > 120) return null;
  if (!/[a-zA-Z]/.test(birthPlace)) return null;
  if (/^(unknown|n\/a|na|none|null|test)$/i.test(birthPlace)) return null;

  return birthPlace;
}

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;
    const birthDetails = await getSavedBirthDetails({
      request,
      userId: user.id,
    });

    return NextResponse.json({
      complete: isCompleteBirthDetails(birthDetails),
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
    const dateOfBirth = normalizeDateOfBirth(requestBody.dateOfBirth);
    const birthTime = normalizeBirthTime(requestBody.birthTime);
    const birthPlace = normalizeBirthPlace(requestBody.birthPlace);

    if (!dateOfBirth) {
      return validationError("Please enter a valid past date of birth.", "dateOfBirth");
    }

    if (!birthTime) {
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
      return validationError(
        "We could not locate that birth place. Please enter a clear city, state, and country.",
        "birthPlace"
      );
    }

    await upsertBirthDetails({
      request,
      userId: user.id,
      dateOfBirth,
      birthTime,
      birthPlace: location.name || birthPlace,
      latitude: location.latitude,
      longitude: location.longitude,
      timezoneOffset: location.timezoneOffset,
    });

    const savedBirthDetails = await getSavedBirthDetails({
      request,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      birthDetails: toBirthDetailsResponse(savedBirthDetails),
    });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}
