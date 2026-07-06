export type BirthDetails = {
  dateOfBirth?: string;
  birthTime?: string;
  birthPlace?: string;
  isComplete: boolean;
  missing: string[];
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
  const numericDate = text.match(
    /\b(?:(\d{4})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}))\b/
  );

  if (numericDate) {
    if (numericDate[1] && numericDate[2] && numericDate[3]) {
      return `${numericDate[1]}-${pad2(numericDate[2])}-${pad2(
        numericDate[3]
      )}`;
    }

    if (numericDate[4] && numericDate[5] && numericDate[6]) {
      return toIsoDate(numericDate[4], numericDate[5], numericDate[6]);
    }
  }

  const namedDate = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{2,4})\b/i
  );

  if (namedDate) {
    return toIsoDate(
      namedDate[1],
      monthNumbers[namedDate[2].toLowerCase()],
      namedDate[3]
    );
  }

  const reversedNamedDate = text.match(
    /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/i
  );

  if (reversedNamedDate) {
    return toIsoDate(
      reversedNamedDate[2],
      monthNumbers[reversedNamedDate[1].toLowerCase()],
      reversedNamedDate[3]
    );
  }

  return undefined;
}

function normalizeTime(hourText: string, minuteText = "00", meridiem = "") {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  const marker = meridiem.toLowerCase();

  if (marker.includes("p") && hour < 12) hour += 12;
  if (marker.includes("a") && hour === 12) hour = 0;

  if (hour > 23 || minute > 59) return undefined;

  return `${pad2(hour)}:${pad2(minute)}`;
}

function extractTime(text: string) {
  const explicitTime = text.match(
    /\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.|morning|evening|night)?\b/i
  );

  if (explicitTime) {
    return normalizeTime(
      explicitTime[1],
      explicitTime[2],
      explicitTime[3] || ""
    );
  }

  const labeledHour = text.match(
    /\b(?:birth\s*time|time\s*of\s*birth|born\s*at|time)\s*(?:is|:|-)?\s*(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.|morning|evening|night)\b/i
  );

  if (labeledHour) {
    return normalizeTime(labeledHour[1], "00", labeledHour[2]);
  }

  return undefined;
}

function cleanPlaceCandidate(candidate: string) {
  return candidate
    .replace(/\b(?:dob|date of birth|birth date|born on|birth time|time of birth|time|born at|born in|birth place|place of birth|birthplace|city|place|is|my|i was)\b/gi, " ")
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
    .replace(/\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.|morning|evening|night)\b/gi, " ")
    .replace(/[.;!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,\s:-]+|[,\s:-]+$/g, "")
    .trim();
}

function isLikelyPlace(candidate: string) {
  if (!candidate || candidate.length < 3) return false;
  if (!/[a-z]/i.test(candidate)) return false;
  if (/\b(career|marriage|love|money|business|job|health|future|kundli|reading|prediction)\b/i.test(candidate)) {
    return false;
  }

  return candidate
    .split(/[,\s]+/)
    .some((word) => /^[a-z][a-z.'-]{2,}$/i.test(word));
}

function extractPlace(text: string) {
  const keywordPlace = text.match(
    /\b(?:birth\s*place|place\s*of\s*birth|birthplace|born\s+in|city)\s*(?:is|:|-)?\s*([a-z][a-z\s,.'-]{2,})(?=$|\n|[.;!?])/i
  );

  if (keywordPlace) {
    const place = cleanPlaceCandidate(keywordPlace[1]);
    if (isLikelyPlace(place)) return place;
  }

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const hasBirthData = Boolean(extractDate(line) || extractTime(line));
    if (!hasBirthData) continue;

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
  const missing: string[] = [];

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
