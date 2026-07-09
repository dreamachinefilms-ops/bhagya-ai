export type BirthDetails = {
  dateOfBirth?: string;
  birthTime?: string | null;
  birthTimeKnown?: boolean;
  birthTimeAccuracy?: "known" | "unknown";
  calculationFallbackTime?: string;
  birthPlace?: string;
  isComplete: boolean;
  missing: Array<"dateOfBirth" | "birthTime" | "birthPlace">;
};

const monthNumbers: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function pad2(value: string | number) {
  return String(value).padStart(2, "0");
}

function normalizeYear(year: string) {
  if (year.length === 4) return year;
  const numericYear = Number(year);
  return numericYear > 30 ? `19${year}` : `20${year}`;
}

function toIsoDate(day: string, month: string, year: string) {
  return `${normalizeYear(year)}-${pad2(month)}-${pad2(day)}`;
}

function getUserOnlyText(conversationText: string) {
  const lines = conversationText.split(/\r?\n/);
  const userLines = lines
    .filter((line) => /^\s*user\s*:/i.test(line))
    .map((line) => line.replace(/^\s*user\s*:\s*/i, ""));

  return (userLines.length > 0 ? userLines : lines).join("\n");
}

function extractDate(text: string) {
  const candidates: Array<{ index: number; value: string }> = [];
  const numericMatches = Array.from(
    text.matchAll(
      /\b(?:(\d{4})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}))\b/g
    )
  );

  numericMatches.forEach((numericDate) => {
    if (numericDate[1] && numericDate[2] && numericDate[3]) {
      candidates.push({
        index: numericDate.index,
        value: `${numericDate[1]}-${pad2(numericDate[2])}-${pad2(
          numericDate[3]
        )}`,
      });
    }

    if (numericDate[4] && numericDate[5] && numericDate[6]) {
      candidates.push({
        index: numericDate.index,
        value: toIsoDate(numericDate[4], numericDate[5], numericDate[6]),
      });
    }
  });

  const dayMonthYearMatches = Array.from(
    text.matchAll(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{2,4})\b/gi
    )
  );
  dayMonthYearMatches.forEach((dayMonthYear) => {
    candidates.push({
      index: dayMonthYear.index,
      value: toIsoDate(
        dayMonthYear[1],
        monthNumbers[dayMonthYear[2].toLowerCase()],
        dayMonthYear[3]
      ),
    });
  });

  const monthDayYearMatches = Array.from(
    text.matchAll(
      /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/gi
    )
  );
  monthDayYearMatches.forEach((monthDayYear) => {
    candidates.push({
      index: monthDayYear.index,
      value: toIsoDate(
        monthDayYear[2],
        monthNumbers[monthDayYear[1].toLowerCase()],
        monthDayYear[3]
      ),
    });
  });

  return candidates.sort((a, b) => a.index - b.index).at(-1)?.value;
}

function normalizeTime(hourText: string, minuteText = "00", marker = "") {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  const normalizedMarker = marker.toLowerCase();

  if (normalizedMarker.includes("p") && hour < 12) hour += 12;
  if (normalizedMarker.includes("a") && hour === 12) hour = 0;
  if (normalizedMarker.includes("evening") && hour < 12) hour += 12;
  if (normalizedMarker.includes("night") && hour < 12 && hour !== 12) {
    hour += 12;
  }

  if (hour > 23 || minute > 59) return undefined;

  return `${pad2(hour)}:${pad2(minute)}`;
}

function extractTime(text: string) {
  const candidates: Array<{ index: number; value: string }> = [];
  const exactTimeMatches = Array.from(
    text.matchAll(
      /\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.|morning|evening|night)?\b/gi
    )
  );

  exactTimeMatches.forEach((exactTime) => {
    const value = normalizeTime(exactTime[1], exactTime[2], exactTime[3] || "");

    if (value) candidates.push({ index: exactTime.index, value });
  });

  const hourWithMarkerMatches = Array.from(
    text.matchAll(
      /\b(?:birth\s*time|time\s*of\s*birth|born\s*at|time)?\s*(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|morning|evening|night)\b/gi
    )
  );
  hourWithMarkerMatches.forEach((hourWithMarker) => {
    const value = normalizeTime(hourWithMarker[1], "00", hourWithMarker[2]);

    if (value) candidates.push({ index: hourWithMarker.index, value });
  });

  return candidates.sort((a, b) => a.index - b.index).at(-1)?.value;
}

function removeKnownDetails(text: string) {
  return text
    .replace(/\b(?:dob|date of birth|birth date|born on)\b/gi, " ")
    .replace(/\b(?:birth time|time of birth|born at|time)\b/gi, " ")
    .replace(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{2,4}\b/gi,
      " "
    )
    .replace(
      /\b(?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}\b/gi,
      " "
    )
    .replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm|a\.m\.|p\.m\.|morning|evening|night)?\b/gi, " ")
    .replace(/\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.|morning|evening|night)\b/gi, " ");
}

function cleanPlaceCandidate(candidate: string) {
  return removeKnownDetails(candidate)
    .replace(/\b(?:actually|correction|corrected|updated|update)\b/gi, " ")
    .replace(/\bnot\s+[a-z][a-z\s,.'-]*/gi, " ")
    .replace(/\b(?:born in|birth place|birthplace|place of birth|place|city|is|my|i was|at|in)\b/gi, " ")
    .replace(/[.;!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,\s:-]+|[,\s:-]+$/g, "")
    .trim();
}

function isLikelyPlace(candidate: string) {
  if (!candidate || candidate.length < 3) return false;
  if (!/[a-z]/i.test(candidate)) return false;
  if (
    /\b(career|marriage|love|money|business|job|health|future|kundli|reading|prediction|about|janna|jaanna)\b/i.test(
      candidate
    )
  ) {
    return false;
  }

  return /^[a-z][a-z\s,.'-]{2,}$/i.test(candidate);
}

function extractPlace(text: string) {
  const lines = text.split(/\r?\n/);

  for (const line of [...lines].reverse()) {
    const keywordPlace = line.match(
      /\b(?:born\s+in|birth\s*place|birthplace|place\s*of\s*birth|place|city)\s*(?:is|:|-)?\s*([a-z][a-z\s,.'-]{2,})(?=$|[.;!?])/i
    );

    if (keywordPlace) {
      const place = cleanPlaceCandidate(keywordPlace[1]);
      if (isLikelyPlace(place)) return place;
    }
  }

  const commaSegments = text.split(",").reverse();
  for (const segment of commaSegments) {
    const place = cleanPlaceCandidate(segment);
    if (isLikelyPlace(place)) return place;
  }

  for (const line of [...lines].reverse()) {
    if (!extractDate(line) && !extractTime(line)) continue;

    const place = cleanPlaceCandidate(line);
    if (isLikelyPlace(place)) return place;
  }

  return undefined;
}

export function extractBirthDetailsFromConversation(
  conversationText: string
): BirthDetails {
  const userText = getUserOnlyText(conversationText);
  const normalizedText = userText.replace(/\s+/g, " ").trim();
  const dateOfBirth = extractDate(normalizedText);
  const birthTime = extractTime(normalizedText);
  const birthPlace = extractPlace(userText);
  const missing: BirthDetails["missing"] = [];

  if (!dateOfBirth) missing.push("dateOfBirth");
  if (!birthTime) missing.push("birthTime");
  if (!birthPlace) missing.push("birthPlace");

  return {
    dateOfBirth,
    birthTime,
    birthPlace,
    isComplete: missing.length === 0,
    missing,
  };
}
