import type { BirthDetails } from "./extractBirthDetails";

export type AstrologyChartData = {
  provider: string;
  birthDetails: BirthDetails;
  raw?: unknown;
  summary?: {
    ascendant?: string;
    moonSign?: string;
    sunSign?: string;
    nakshatra?: string;
    currentMahadasha?: string;
    currentAntardasha?: string;
  };
  planets?: Array<{
    name: string;
    sign?: string;
    house?: string | number;
    degree?: string | number;
    nakshatra?: string;
    retrograde?: boolean;
  }>;
  houses?: Array<{
    house: number;
    sign?: string;
    lord?: string;
  }>;
  yogas?: string[];
};

type UnknownRecord = Record<string, unknown>;

const prokeralaBaseUrl =
  process.env.PROKERALA_BASE_URL || "https://api.prokerala.com";
const divineApiBaseUrl =
  process.env.DIVINE_API_BASE_URL || "https://astroapi-3.divineapi.com";

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;
}

function readString(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = source;

    for (const key of path) {
      const record = asRecord(current);
      current = record?.[key];
    }

    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }

    if (typeof current === "number") {
      return String(current);
    }
  }

  return undefined;
}

function readArray(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = source;

    for (const key of path) {
      const record = asRecord(current);
      current = record?.[key];
    }

    if (Array.isArray(current)) return current;
  }

  return [];
}

function mapSummary(raw: unknown): AstrologyChartData["summary"] {
  return {
    ascendant: readString(raw, [
      ["data", "ascendant", "sign", "name"],
      ["data", "ascendant", "sign"],
      ["data", "ascendant"],
      ["ascendant"],
      ["lagna"],
    ]),
    moonSign: readString(raw, [
      ["data", "moon_sign", "name"],
      ["data", "moon_sign"],
      ["data", "rasi", "name"],
      ["moonSign"],
      ["moon_sign"],
    ]),
    sunSign: readString(raw, [
      ["data", "sun_sign", "name"],
      ["data", "sun_sign"],
      ["sunSign"],
      ["sun_sign"],
    ]),
    nakshatra: readString(raw, [
      ["data", "nakshatra", "name"],
      ["data", "nakshatra"],
      ["nakshatra"],
    ]),
    currentMahadasha: readString(raw, [
      ["data", "dasha", "mahadasha", "planet"],
      ["data", "current_mahadasha"],
      ["currentMahadasha"],
      ["mahadasha"],
    ]),
    currentAntardasha: readString(raw, [
      ["data", "dasha", "antardasha", "planet"],
      ["data", "current_antardasha"],
      ["currentAntardasha"],
      ["antardasha"],
    ]),
  };
}

function mapPlanets(raw: unknown): AstrologyChartData["planets"] {
  const planetItems = readArray(raw, [
    ["data", "planets"],
    ["data", "planet_position"],
    ["data", "planet_positions"],
    ["planets"],
    ["planet_position"],
  ]);

  return planetItems
    .map((planet) => {
      const planetRecord = asRecord(planet);
      const name = readString(planetRecord, [
        ["name"],
        ["planet"],
        ["planet_name"],
      ]);

      if (!name) return null;

      return {
        name,
        sign: readString(planetRecord, [["sign"], ["rasi"], ["zodiac"]]),
        house: readString(planetRecord, [["house"], ["house_number"]]),
        degree: readString(planetRecord, [["degree"], ["longitude"]]),
        nakshatra: readString(planetRecord, [["nakshatra"], ["star"]]),
        retrograde: Boolean(
          planetRecord?.retrograde || planetRecord?.is_retrograde
        ),
      };
    })
    .filter(Boolean) as AstrologyChartData["planets"];
}

function mapHouses(raw: unknown): AstrologyChartData["houses"] {
  const houseItems = readArray(raw, [["data", "houses"], ["houses"]]);

  return houseItems
    .map((house, index) => {
      const houseRecord = asRecord(house);
      const houseNumber = Number(
        readString(houseRecord, [["house"], ["number"], ["house_number"]]) ||
          index + 1
      );

      if (!Number.isFinite(houseNumber)) return null;

      return {
        house: houseNumber,
        sign: readString(houseRecord, [["sign"], ["rasi"], ["zodiac"]]),
        lord: readString(houseRecord, [["lord"], ["ruler"]]),
      };
    })
    .filter(Boolean) as AstrologyChartData["houses"];
}

function mapYogas(raw: unknown) {
  return readArray(raw, [["data", "yogas"], ["yogas"]])
    .map((yoga) => {
      if (typeof yoga === "string") return yoga;
      return readString(yoga, [["name"], ["yoga"]]);
    })
    .filter((yoga): yoga is string => Boolean(yoga));
}

function normalizeChartData(
  provider: string,
  birthDetails: BirthDetails,
  raw: unknown
): AstrologyChartData {
  return {
    provider,
    birthDetails,
    raw,
    summary: mapSummary(raw),
    planets: mapPlanets(raw),
    houses: mapHouses(raw),
    yogas: mapYogas(raw),
  };
}

function buildDateTime(birthDetails: BirthDetails) {
  if (!birthDetails.dateOfBirth || !birthDetails.birthTime) return undefined;
  return `${birthDetails.dateOfBirth}T${birthDetails.birthTime}:00`;
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) return null;
  return response.json();
}

async function getProkeralaToken() {
  const clientId = process.env.PROKERALA_CLIENT_ID;
  const clientSecret = process.env.PROKERALA_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );
  const tokenUrl = process.env.PROKERALA_TOKEN_URL || `${prokeralaBaseUrl}/token`;
  const tokenData = await fetchJson(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  return readString(tokenData, [["access_token"]]);
}

async function getProkeralaChartData(birthDetails: BirthDetails) {
  const accessToken = await getProkeralaToken();
  const dateTime = buildDateTime(birthDetails);

  if (!accessToken || !dateTime || !birthDetails.birthPlace) return null;

  const endpoint =
    process.env.PROKERALA_CHART_ENDPOINT ||
    `${prokeralaBaseUrl}/v2/astrology/birth-chart`;
  const params = new URLSearchParams({
    datetime: dateTime,
    location: birthDetails.birthPlace,
    ayanamsa: process.env.PROKERALA_AYANAMSA || "1",
  });
  const raw = await fetchJson(`${endpoint}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return raw ? normalizeChartData("prokerala", birthDetails, raw) : null;
}

async function getDivineApiChartData(birthDetails: BirthDetails) {
  const apiKey = process.env.DIVINE_API_KEY;
  const dateTime = buildDateTime(birthDetails);

  if (!apiKey || !dateTime || !birthDetails.birthPlace) return null;

  const endpoint =
    process.env.DIVINE_API_CHART_ENDPOINT ||
    `${divineApiBaseUrl}/indian-api/v1/birth-chart`;
  const raw = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      dateOfBirth: birthDetails.dateOfBirth,
      birthTime: birthDetails.birthTime,
      birthPlace: birthDetails.birthPlace,
      datetime: dateTime,
    }),
  });

  return raw ? normalizeChartData("divineapi", birthDetails, raw) : null;
}

export async function getAstrologyChartData(
  birthDetails: BirthDetails
): Promise<AstrologyChartData | null> {
  const provider = process.env.ASTROLOGY_PROVIDER?.toLowerCase();

  try {
    if (provider === "prokerala") {
      return getProkeralaChartData(birthDetails);
    }

    if (provider === "divineapi") {
      return getDivineApiChartData(birthDetails);
    }
  } catch (error) {
    console.error("Astrology provider error:", error);
  }

  return null;
}
