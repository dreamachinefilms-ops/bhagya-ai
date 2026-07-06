import { getMessagingStyleInstruction } from "@/lib/backend/messagingStyle";

export type NumerologyDetails = {
  fullName?: string;
  dateOfBirth?: string;
  isComplete: boolean;
  missing: string[];
};

export type NumerologyData = {
  details: NumerologyDetails;
  birthNumber: number;
  lifePathNumber: number;
  destinyNumber: number;
  nameNumber?: number;
};

const pythagoreanValues: Record<string, number> = {
  a: 1,
  j: 1,
  s: 1,
  b: 2,
  k: 2,
  t: 2,
  c: 3,
  l: 3,
  u: 3,
  d: 4,
  m: 4,
  v: 4,
  e: 5,
  n: 5,
  w: 5,
  f: 6,
  o: 6,
  x: 6,
  g: 7,
  p: 7,
  y: 7,
  h: 8,
  q: 8,
  z: 8,
  i: 9,
  r: 9,
};

function pad2(value: string | number) {
  return String(value).padStart(2, "0");
}

function normalizeYear(year: string) {
  if (year.length === 4) return year;
  const numericYear = Number(year);
  return numericYear > 30 ? `19${year}` : `20${year}`;
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

  if (!numericDate) return undefined;

  if (numericDate[1] && numericDate[2] && numericDate[3]) {
    return `${numericDate[1]}-${pad2(numericDate[2])}-${pad2(
      numericDate[3]
    )}`;
  }

  if (numericDate[4] && numericDate[5] && numericDate[6]) {
    return `${normalizeYear(numericDate[6])}-${pad2(numericDate[5])}-${pad2(
      numericDate[4]
    )}`;
  }

  return undefined;
}

function cleanName(name: string) {
  return name
    .replace(/\b(?:dob|date of birth|born on|birth date)\b.*$/i, "")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "")
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFullName(text: string) {
  const labeledName = text.match(
    /\b(?:full\s*name|my\s*name\s*is|name\s*is|naam)\s*(?:is|:|-)?\s*([\p{L}\s.'-]{3,})(?=$|\n|[.,;!?])/iu
  );

  if (labeledName) {
    const name = cleanName(labeledName[1]);
    if (name.split(/\s+/).length >= 2) return name;
  }

  for (const line of text.split(/\r?\n/)) {
    if (!extractDate(line)) continue;

    const name = cleanName(line);
    if (name.split(/\s+/).length >= 2) return name;
  }

  return undefined;
}

function reduceNumber(value: number) {
  let result = Math.abs(value);

  while (result > 9) {
    result = String(result)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }

  return result;
}

function sumDigits(value: string) {
  return value
    .replace(/\D/g, "")
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
}

function calculateNameNumber(fullName: string) {
  const total = fullName
    .toLowerCase()
    .split("")
    .reduce((sum, letter) => sum + (pythagoreanValues[letter] || 0), 0);

  return total > 0 ? reduceNumber(total) : undefined;
}

export function extractNumerologyDetailsFromConversation(
  conversationText: string
): NumerologyDetails {
  const userText = getUserOnlyText(conversationText);
  const fullName = extractFullName(userText);
  const dateOfBirth = extractDate(userText.replace(/\s+/g, " "));
  const missing: string[] = [];

  if (!fullName) missing.push("fullName");
  if (!dateOfBirth) missing.push("dateOfBirth");

  return {
    fullName,
    dateOfBirth,
    isComplete: missing.length === 0,
    missing,
  };
}

export function calculateNumerology(
  details: NumerologyDetails
): NumerologyData | null {
  if (!details.dateOfBirth || !details.isComplete) return null;

  const [, , dayText] = details.dateOfBirth.split("-");
  const birthNumber = reduceNumber(Number(dayText));
  const lifePathNumber = reduceNumber(sumDigits(details.dateOfBirth));
  const nameNumber = details.fullName
    ? calculateNameNumber(details.fullName)
    : undefined;

  return {
    details,
    birthNumber,
    lifePathNumber,
    destinyNumber: lifePathNumber,
    nameNumber,
  };
}

export function buildNumerologyPrompt({
  language,
  languageCode,
  conversationText,
  numerologyData,
}: {
  language: string;
  languageCode: string;
  conversationText: string;
  numerologyData: NumerologyData;
}) {
  return `
You are Bhagya.ai, a warm Indian numerology guide.

Selected language:
${language}

Selected language code:
${languageCode}

Conversation:
${conversationText}

Calculated numerology data:
${JSON.stringify(numerologyData, null, 2)}

Rules:
* Reply only in ${language}.
* For Hinglish, use Roman Hindi-English.
* Base the reading on the calculated numbers above.
* Mention the birth number, life path/destiny number, and name number if available.
* Do not invent numbers.
* Do not give a generic numerology answer.
* Make the meaning change based on the user's actual birth number, life path number, and name number.
* Focus on the user's original question.
* Keep the answer concise: 2-4 short sentences.
* Do not claim 100% certainty.

${getMessagingStyleInstruction("numerology")}
  `;
}
