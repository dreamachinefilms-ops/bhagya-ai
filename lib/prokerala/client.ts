import type { ResolvedLocation } from "./locationResolver";

type ProkeralaTokenCache = {
  accessToken: string;
  expiresAt: number;
};

export type ProkeralaKundliResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      error: "missing_credentials" | "token_error" | "api_error";
    };

let cachedToken: ProkeralaTokenCache | null = null;

function getBaseUrl() {
  return process.env.PROKERALA_BASE_URL || "https://api.prokerala.com";
}

function hasCredentials() {
  return Boolean(
    process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET
  );
}

export function getProkeralaEnvStatus() {
  return {
    hasClientId: Boolean(process.env.PROKERALA_CLIENT_ID),
    hasClientSecret: Boolean(process.env.PROKERALA_CLIENT_SECRET),
    hasBaseUrl: Boolean(process.env.PROKERALA_BASE_URL),
    hasAyanamsa: Boolean(process.env.PROKERALA_AYANAMSA),
  };
}

function isPlaceholderSecret(secret: string | undefined) {
  return !secret || /your_.*secret.*here/i.test(secret);
}

export async function getProkeralaAccessToken() {
  const clientId = process.env.PROKERALA_CLIENT_ID;
  const clientSecret = process.env.PROKERALA_CLIENT_SECRET;

  console.log("Prokerala credential check:", {
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
  });

  if (!clientId || isPlaceholderSecret(clientSecret)) {
    return null;
  }
  const safeClientSecret = clientSecret || "";

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const response = await fetch(`${getBaseUrl()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: safeClientSecret,
    }),
  });

  if (!response.ok) {
    console.error("Prokerala token request failed:", {
      status: response.status,
    });
    return null;
  }

  const tokenData = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!tokenData.access_token) {
    console.error("Prokerala token response missing token:", {
      hasAccessToken: Boolean(tokenData.access_token),
      hasExpiresIn: Boolean(tokenData.expires_in),
    });
    return null;
  }

  cachedToken = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
  };

  return cachedToken.accessToken;
}

export function buildProkeralaDateTime({
  dateOfBirth,
  birthTime,
  timezoneOffset,
}: {
  dateOfBirth: string;
  birthTime: string;
  timezoneOffset: string;
}) {
  const dateParts = dateOfBirth.split(/[/-]/);
  const [year, month, day] =
    dateParts[0]?.length === 4
      ? [dateParts[0], dateParts[1], dateParts[2]]
      : [dateParts[2], dateParts[1], dateParts[0]];
  const [hour = "00", minute = "00"] = birthTime.split(":");

  return `${year}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0"
  )}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00${timezoneOffset}`;
}

export async function callProkeralaKundli({
  datetime,
  location,
}: {
  datetime: string;
  location: ResolvedLocation;
}): Promise<ProkeralaKundliResult> {
  if (
    !datetime ||
    !Number.isFinite(location?.latitude) ||
    !Number.isFinite(location?.longitude)
  ) {
    return { ok: false, error: "api_error" };
  }

  if (!hasCredentials() || isPlaceholderSecret(process.env.PROKERALA_CLIENT_SECRET)) {
    return { ok: false, error: "missing_credentials" };
  }

  try {
    const accessToken = await getProkeralaAccessToken();

    if (!accessToken) {
      return { ok: false, error: "token_error" };
    }

    const params = new URLSearchParams({
      ayanamsa: process.env.PROKERALA_AYANAMSA || "1",
      coordinates: `${location.latitude},${location.longitude}`,
      datetime,
      la: "en",
      result_type: "advanced",
    });

    const response = await fetch(
      `${getBaseUrl()}/v2/astrology/kundli?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Prokerala kundli request failed:", {
        status: response.status,
      });
      return { ok: false, error: "api_error" };
    }

    return { ok: true, data: await response.json() };
  } catch (error) {
    console.error("Prokerala kundli request error:", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, error: "api_error" };
  }
}
