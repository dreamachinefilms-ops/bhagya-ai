import assert from "node:assert/strict";
import test from "node:test";
import { buildAstrologyPrompt } from "../astrology/prompt.ts";
import { calculateNumerologyProfile } from "../numerology/calculations.ts";
import { buildNumerologyPrompt } from "../numerology/prompt.ts";
import { buildPalmistryPrompt } from "../palmistry/prompt.ts";
import { buildTarotFollowUpPrompt } from "../tarot/prompt.ts";
import type { DrawnTarotCard, TarotReadingSummary } from "../tarot/reading.ts";
import {
  FORBIDDEN_USER_ADDRESS_TERMS,
  createGuidanceResponsePlan,
  getFirstName,
  resolveFirstNameForResponse,
  sanitizeGuidanceResponse,
  selectGuidanceResponseDepth,
} from "./promptCore.ts";
import {
  findIncorrectNumerologyClaims,
  findUnsupportedPalmClaims,
  findUnsupportedTarotCards,
  findUnsupportedUnknownTimeAstrologyClaims,
} from "./groundingChecks.ts";

const location = {
  name: "Delhi",
  displayName: "Delhi, India",
  latitude: 28.6139,
  longitude: 77.209,
  timezoneOffset: "+05:30",
};

function tarotCard({
  name,
  orientation,
  position,
  meaning,
}: {
  name: string;
  orientation: "upright" | "reversed";
  position: string;
  meaning: string;
}): DrawnTarotCard {
  return {
    cardId: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    orientation,
    position,
    selectionIndex: 0,
    imagePath: "/card.webp",
    keywords: meaning.split(/\s+/),
    shortMeaning: meaning,
  };
}

function tarotReading(cards: DrawnTarotCard[]): TarotReadingSummary {
  return {
    readingId: "reading-id",
    question: "What should I understand about my career?",
    spreadType: "three-card",
    spreadName: "Career Guidance",
    cards,
    interpretation: "The first interpretation used these exact cards.",
  };
}

test("Astrology prompts change with verified chart data and preserve unknown-time uncertainty", () => {
  const userA = buildAstrologyPrompt({
    language: "English",
    languageCode: "english",
    conversationText: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
    currentQuestion: "Career",
    birthDetails: {
      dateOfBirth: "1990-01-12",
      birthTime: "08:15",
      birthTimeKnown: true,
      isComplete: true,
      missing: [],
    },
    location,
    prokeralaData: { career: { planet: "Saturn", house: 10 } },
    firstName: "Asha",
    responseDepth: "brief",
  });
  const userB = buildAstrologyPrompt({
    language: "English",
    languageCode: "english",
    conversationText: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
    currentQuestion: "Career",
    birthDetails: {
      dateOfBirth: "1995-06-04",
      birthTime: null,
      birthTimeKnown: false,
      calculationFallbackTime: "12:00",
      isComplete: true,
      missing: [],
    },
    location: { ...location, name: "Mumbai", displayName: "Mumbai, India" },
    prokeralaData: { planets: [{ name: "Jupiter", sign: "Sagittarius" }] },
    firstName: "Ravi",
    responseDepth: "brief",
  });

  assert.notEqual(userA.instructions, userB.instructions);
  assert.match(userA.instructions, /Saturn/);
  assert.match(userB.instructions, /Jupiter/);
  assert.match(userB.instructions, /exact birth time is unknown/i);
  assert.match(userB.instructions, /do not make confident Ascendant/i);
});

test("Numerology prompts preserve different deterministic profiles", () => {
  const baseA = calculateNumerologyProfile({
    fullName: "Asha Mehta",
    dateOfBirth: "1990-01-12",
    now: new Date("2026-07-16T06:00:00Z"),
  });
  const baseB = calculateNumerologyProfile({
    fullName: "Ravi Desai",
    dateOfBirth: "1988-09-17",
    now: new Date("2026-07-16T06:00:00Z"),
  });
  baseA.coreNumbers.lifePath.reducedNumber = 7;
  baseA.coreNumbers.expression.reducedNumber = 3;
  baseB.coreNumbers.lifePath.reducedNumber = 8;
  baseB.coreNumbers.expression.reducedNumber = 4;

  const userA = buildNumerologyPrompt({
    profile: baseA,
    firstName: "Asha",
    language: "English",
    languageCode: "english",
    history: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
    question: "Career",
  });
  const userB = buildNumerologyPrompt({
    profile: baseB,
    firstName: "Ravi",
    language: "English",
    languageCode: "english",
    history: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
    question: "Career",
  });

  assert.notEqual(userA.instructions, userB.instructions);
  assert.match(userA.instructions, /"lifePath":\s*\{\s*"number": 7/);
  assert.match(userA.instructions, /"expression":\s*\{\s*"number": 3/);
  assert.match(userB.instructions, /"lifePath":\s*\{\s*"number": 8/);
  assert.match(userB.instructions, /"expression":\s*\{\s*"number": 4/);
});

test("Palmistry prompts retain visible differences from the saved image analysis", () => {
  const userA = buildPalmistryPrompt({
    language: "English",
    languageCode: "english",
    conversationText: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
    currentQuestion: "Career",
    palmContext: {
      headLine: { visible: true, observations: ["straight Head Line"], confidence: 0.9 },
      fateLine: { visible: true, observations: ["faint Fate Line"], confidence: 0.42 },
    },
  });
  const userB = buildPalmistryPrompt({
    language: "English",
    languageCode: "english",
    conversationText: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
    currentQuestion: "Career",
    palmContext: {
      headLine: { visible: true, observations: ["curved Head Line"], confidence: 0.88 },
      fateLine: { visible: true, observations: ["strong Fate Line"], confidence: 0.91 },
    },
  });

  assert.notEqual(userA.instructions, userB.instructions);
  assert.match(userA.instructions, /straight Head Line/);
  assert.match(userA.instructions, /faint Fate Line/);
  assert.match(userB.instructions, /curved Head Line/);
  assert.match(userB.instructions, /strong Fate Line/);
});

test("Tarot prompts use only each active spread and its saved orientations", () => {
  const cardsA = [
    tarotCard({ name: "The Star", orientation: "upright", position: "Current Path", meaning: "renewed hope" }),
    tarotCard({ name: "Eight of Cups", orientation: "upright", position: "Challenge or Opportunity", meaning: "leaving what is complete" }),
    tarotCard({ name: "Two of Pentacles", orientation: "reversed", position: "Guidance", meaning: "reduce overload" }),
  ];
  const cardsB = [
    tarotCard({ name: "The Tower", orientation: "upright", position: "Current Path", meaning: "necessary disruption" }),
    tarotCard({ name: "Queen of Cups", orientation: "upright", position: "Challenge or Opportunity", meaning: "emotional wisdom" }),
    tarotCard({ name: "The Sun", orientation: "upright", position: "Guidance", meaning: "clarity and confidence" }),
  ];
  const userA = buildTarotFollowUpPrompt({
    language: "English",
    languageCode: "english",
    question: "Career",
    reading: tarotReading(cardsA),
    conversationText: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
  });
  const userB = buildTarotFollowUpPrompt({
    language: "English",
    languageCode: "english",
    question: "Career",
    reading: tarotReading(cardsB),
    conversationText: "User: Career",
    historyMessages: [{ role: "user", content: "Career" }],
  });

  assert.notEqual(userA.instructions, userB.instructions);
  assert.match(userA.instructions, /The Star/);
  assert.match(userA.instructions, /Two of Pentacles \(reversed\)/);
  assert.doesNotMatch(userA.instructions, /Queen of Cups/);
  assert.match(userB.instructions, /The Tower/);
  assert.match(userB.instructions, /The Sun/);
  assert.doesNotMatch(userB.instructions, /Eight of Cups/);
});

test("short conversational messages select brief replies and continue the active thread", () => {
  assert.equal(selectGuidanceResponseDepth("Career"), "brief");
  assert.equal(selectGuidanceResponseDepth("Okay"), "brief");
  assert.equal(selectGuidanceResponseDepth("Tell me more"), "standard");
  assert.equal(
    selectGuidanceResponseDepth("Please give me a complete reading in detail"),
    "deep",
  );

  const plan = createGuidanceResponsePlan({
    service: "palmistry",
    userMessage: "Tell me more",
    relevantEvidence: [{ source: "saved Fate Line", value: "faint" }],
    history: [{ role: "assistant", content: "The Fate Line is faint in this photo." }],
    useFirstName: false,
  });
  assert.match(plan.newAngle, /Continue the most recent insight/i);
  assert.equal(plan.askFollowUp, false);
});

test("first names are extracted sparingly and forbidden direct addresses are sanitized", () => {
  assert.equal(getFirstName("  Sagan Kumar Sharma "), "Sagan");
  assert.equal(getFirstName(null), null);
  assert.equal(
    resolveFirstNameForResponse({
      fullName: "Sagan Kumar Sharma",
      messages: [],
      isInitialReading: true,
      userMessage: "Career",
    }),
    "Sagan",
  );
  assert.equal(
    resolveFirstNameForResponse({
      fullName: "Sagan Kumar Sharma",
      messages: [{ role: "assistant", content: "Sagan, the strongest factor is Saturn." }],
      isInitialReading: false,
      userMessage: "Career",
    }),
    null,
  );

  const sanitized = sanitizeGuidanceResponse({
    answer:
      "Dear friend, your Life Path is 7. Your friend may still influence this choice. Sagan Kumar Sharma ji, stay practical.",
    firstName: "Sagan",
    fullName: "Sagan Kumar Sharma",
  });

  assert.doesNotMatch(sanitized, /^Dear friend/i);
  assert.match(sanitized, /Your friend may still influence/);
  assert.doesNotMatch(sanitized, /Sagan Kumar Sharma/);
  assert.doesNotMatch(sanitized, /Sagan ji/);
  assert.ok(FORBIDDEN_USER_ADDRESS_TERMS.includes("dost"));
});

test("deterministic grounding checks reject invented service evidence", () => {
  const profile = calculateNumerologyProfile({
    fullName: "Asha Mehta",
    dateOfBirth: "1990-01-12",
    now: new Date("2026-07-16T06:00:00Z"),
  });
  profile.coreNumbers.lifePath.reducedNumber = 7;
  assert.deepEqual(
    findIncorrectNumerologyClaims("Your Life Path is 8.", profile),
    ["Life Path must remain 7, not 8"],
  );

  assert.deepEqual(
    findUnsupportedPalmClaims("Your Fate Line is strong and clear.", {
      fateLine: { visible: false, observations: [], confidence: 0.2 },
    }),
    ["Fate Line is not confirmed in the saved palm evidence"],
  );

  const selected = [
    tarotCard({
      name: "The Star",
      orientation: "upright",
      position: "Guidance",
      meaning: "hope",
    }),
  ];
  assert.deepEqual(
    findUnsupportedTarotCards({
      answer: "The Lovers card adds a second message.",
      selectedCards: selected,
      allCardNames: ["The Star", "The Lovers"],
    }),
    ["The Lovers"],
  );

  assert.deepEqual(
    findUnsupportedUnknownTimeAstrologyClaims(
      "Your Ascendant is Virgo.",
      false,
    ),
    ["exact Ascendant or house claims require a known birth time"],
  );
});
