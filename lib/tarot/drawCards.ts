import { getMessagingStyleInstruction } from "@/lib/backend/messagingStyle";

export type TarotCard = {
  name: string;
  orientation: "upright" | "reversed";
  position: string;
};

const tarotDeck = [
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Devil",
  "The Tower",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World",
  "Ace of Wands",
  "Two of Wands",
  "Three of Wands",
  "Four of Wands",
  "Five of Wands",
  "Six of Wands",
  "Seven of Wands",
  "Eight of Wands",
  "Nine of Wands",
  "Ten of Wands",
  "Page of Wands",
  "Knight of Wands",
  "Queen of Wands",
  "King of Wands",
  "Ace of Cups",
  "Two of Cups",
  "Three of Cups",
  "Four of Cups",
  "Five of Cups",
  "Six of Cups",
  "Seven of Cups",
  "Eight of Cups",
  "Nine of Cups",
  "Ten of Cups",
  "Page of Cups",
  "Knight of Cups",
  "Queen of Cups",
  "King of Cups",
  "Ace of Swords",
  "Two of Swords",
  "Three of Swords",
  "Four of Swords",
  "Five of Swords",
  "Six of Swords",
  "Seven of Swords",
  "Eight of Swords",
  "Nine of Swords",
  "Ten of Swords",
  "Page of Swords",
  "Knight of Swords",
  "Queen of Swords",
  "King of Swords",
  "Ace of Pentacles",
  "Two of Pentacles",
  "Three of Pentacles",
  "Four of Pentacles",
  "Five of Pentacles",
  "Six of Pentacles",
  "Seven of Pentacles",
  "Eight of Pentacles",
  "Nine of Pentacles",
  "Ten of Pentacles",
  "Page of Pentacles",
  "Knight of Pentacles",
  "Queen of Pentacles",
  "King of Pentacles",
];

const threeCardPositions = ["Current energy", "Challenge", "Guidance"];

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function makeRandom(seed: string) {
  let state = hashSeed(seed);

  return () => {
    state = Math.imul(state + 0x6d2b79f5, 1);
    let value = state;
    value ^= value >>> 15;
    value = Math.imul(value, value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawDeterministicTarotCards({
  userId,
  question,
  timestamp,
  count = 3,
}: {
  userId?: string;
  question: string;
  timestamp?: string | number;
  count?: 1 | 3;
}): TarotCard[] {
  const seed = `${userId || "anonymous"}:${question}:${
    timestamp || Date.now()
  }`;
  const random = makeRandom(seed);
  const availableCards = [...tarotDeck];

  const positions = count === 1 ? ["Main guidance"] : threeCardPositions;

  return positions.map((position) => {
    const cardIndex = Math.floor(random() * availableCards.length);
    const [name] = availableCards.splice(cardIndex, 1);

    return {
      name,
      orientation: random() >= 0.5 ? "upright" : "reversed",
      position,
    };
  });
}

export function buildTarotPrompt({
  language,
  languageCode,
  conversationText,
  selectedCards,
}: {
  language: string;
  languageCode: string;
  conversationText: string;
  selectedCards: TarotCard[];
}) {
  return `
You are Bhagya.ai, a warm intuitive tarot reader.

Selected language:
${language}

Selected language code:
${languageCode}

Conversation:
${conversationText}

Selected tarot cards:
${JSON.stringify(selectedCards, null, 2)}

Rules:
* Reply only in ${language}.
* For Hinglish, use Roman Hindi-English.
* Reference every selected card naturally by name and position.
* The answer must depend on the actual selected card names, positions, and orientations above.
* Do not claim cards were physically drawn by the user.
* Focus on the user's original question and topic.
* Do not give a generic tarot answer.
* Keep the answer concise: 2-4 short sentences.
* Do not claim 100% certainty.

${getMessagingStyleInstruction("tarot")}
  `;
}
