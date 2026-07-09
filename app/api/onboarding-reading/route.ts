import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import {
  getSavedBirthDetails,
  getSavedUserProfile,
  isCompleteBirthDetails,
} from "@/lib/backend/birthDetailsMemory";
import { safeErrorResponse } from "@/lib/backend/errors";
import { callBhagyaOpenAI } from "@/lib/backend/openai";
import {
  buildProkeralaDateTime,
  callProkeralaKundli,
} from "@/lib/prokerala/client";
import {
  resolveBirthPlace,
  type ResolvedLocation,
} from "@/lib/prokerala/locationResolver";

const routeName = "api/onboarding-reading";

function getFallbackMessage(firstName?: string | null) {
  const greeting = firstName ? `${firstName}, your` : "Your";

  return `${greeting} Bhagya profile is ready. Start with calm confidence today; your reading will be more personal from here.`;
}

function getSavedLocation(savedBirthDetails: {
  birthPlace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezoneOffset?: string | null;
}): ResolvedLocation | null {
  if (
    !savedBirthDetails.birthPlace ||
    !Number.isFinite(savedBirthDetails.latitude) ||
    !Number.isFinite(savedBirthDetails.longitude) ||
    !savedBirthDetails.timezoneOffset
  ) {
    return null;
  }

  return {
    name: savedBirthDetails.birthPlace,
    displayName: savedBirthDetails.birthPlace,
    latitude: Number(savedBirthDetails.latitude),
    longitude: Number(savedBirthDetails.longitude),
    timezoneOffset: savedBirthDetails.timezoneOffset,
  };
}

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return NextResponse.json(
        {
          code: "UNAUTHORIZED",
          message: "Please sign in again to continue.",
        },
        { status: 401 }
      );
    }

    userId = user.id;

    const [profile, savedBirthDetails] = await Promise.all([
      getSavedUserProfile({ request, userId: user.id }),
      getSavedBirthDetails({ request, userId: user.id }),
    ]);
    const firstName = profile?.firstName;

    if (!savedBirthDetails || !isCompleteBirthDetails(savedBirthDetails)) {
      return NextResponse.json({
        source: "fallback",
        message: getFallbackMessage(firstName),
      });
    }

    const savedLocation = getSavedLocation(savedBirthDetails);
    const location =
      savedLocation || resolveBirthPlace(savedBirthDetails?.birthPlace || "");

    if (!location) {
      return NextResponse.json({
        source: "fallback",
        message: getFallbackMessage(firstName),
      });
    }

    const birthTimeKnown = savedBirthDetails?.birthTimeKnown !== false;
    const calculationBirthTime = birthTimeKnown
      ? savedBirthDetails?.birthTime || "12:00"
      : "12:00";
    const datetime = buildProkeralaDateTime({
      dateOfBirth: savedBirthDetails?.dateOfBirth || "",
      birthTime: calculationBirthTime,
      timezoneOffset: location.timezoneOffset,
    });
    const kundliResult = await callProkeralaKundli({ datetime, location });

    if (!kundliResult.ok) {
      return NextResponse.json({
        source: "fallback",
        message: getFallbackMessage(firstName),
      });
    }

    try {
      const message = await callBhagyaOpenAI({
        instructions: `
You are Bhagya.ai, a warm Indian astrology guide.

Write a short, positive onboarding welcome for a user whose birth profile was just saved.
Use the provided Prokerala chart data only if it clearly supports the point.
Do not invent placements, houses, yogas, dashas, signs, ascendant, moon sign, or nakshatra.
Use the user's first name naturally once if available.
${
  birthTimeKnown
    ? "The exact birth time is known."
    : "The exact birth time is unknown; noon was used only as a broad calculation fallback. Do not mention Lagna, houses, exact timing, or time-sensitive claims."
}
Keep it to 1-2 gentle sentences in English.
        `,
        input: JSON.stringify({
          firstName,
          birthDetails: {
            dateOfBirth: savedBirthDetails?.dateOfBirth,
            birthTime: birthTimeKnown ? savedBirthDetails?.birthTime : null,
            birthTimeKnown,
            birthPlace: savedBirthDetails?.birthPlace,
          },
          location,
          prokeralaData: kundliResult.data,
        }),
      });

      return NextResponse.json({
        source: "astrology",
        message: message || getFallbackMessage(firstName),
      });
    } catch (error) {
      console.error("Onboarding reading OpenAI failed:", {
        userId: user.id,
        errorName: error instanceof Error ? error.name : typeof error,
      });

      return NextResponse.json({
        source: "fallback",
        message: getFallbackMessage(firstName),
      });
    }
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}
