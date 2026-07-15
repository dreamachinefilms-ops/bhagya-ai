import { getMessagingStyleInstruction } from "@/lib/backend/messagingStyle";
import type { TarotCard, TarotOrientation } from "./deck";

export type TarotSpreadType = "one-card" | "three-card";

export type DrawnTarotCard = {
  cardId: string;
  name: string;
  orientation: TarotOrientation;
  position: string;
  selectionIndex: number;
  imagePath: string;
  keywords: string[];
  shortMeaning: string;
};

export type TarotReadingSummary = {
  readingId: string;
  question: string;
  spreadType: TarotSpreadType;
  spreadName: string;
  cards: DrawnTarotCard[];
  interpretation: string;
};

const topicMatchers = {
  career: /\b(career|job|work|business|profession|promotion|office)\b/i,
  relationship: /\b(love|relationship|marriage|partner|ex|crush|connection)\b/i,
  decision: /\b(decision|choose|choice|option|should i|what should)\b/i,
  growth: /\b(growth|healing|self|personal|pattern|spiritual|improve)\b/i,
};

export function isTarotSpreadType(value: unknown): value is TarotSpreadType {
  return value === "one-card" || value === "three-card";
}

export function inferTarotTopic(question: string) {
  if (topicMatchers.career.test(question)) return "career";
  if (topicMatchers.relationship.test(question)) return "relationship";
  if (topicMatchers.decision.test(question)) return "decision";
  if (topicMatchers.growth.test(question)) return "personal-growth";
  return "general";
}

export function getTarotSpread({
  spreadType,
  question,
}: {
  spreadType: TarotSpreadType;
  question: string;
}) {
  if (spreadType === "one-card") {
    return {
      spreadName: "Guidance",
      positions: ["Guidance"],
    };
  }

  const topic = inferTarotTopic(question);

  if (topic === "career") {
    return {
      spreadName: "Career Guidance",
      positions: ["Current Path", "Challenge or Opportunity", "Guidance"],
    };
  }

  if (topic === "relationship") {
    return {
      spreadName: "Relationship Mirror",
      positions: ["Your Energy", "Other Energy", "Connection"],
    };
  }

  if (topic === "decision") {
    return {
      spreadName: "Decision Path",
      positions: ["Current Situation", "What to Consider", "Likely Direction"],
    };
  }

  if (topic === "personal-growth") {
    return {
      spreadName: "Personal Growth",
      positions: ["Current Pattern", "What Needs Attention", "Growth Direction"],
    };
  }

  return {
    spreadName: "Past, Present, Direction",
    positions: ["Past Influence", "Present Energy", "Likely Direction"],
  };
}

export function buildDrawnCard({
  card,
  orientation,
  position,
  selectionIndex,
}: {
  card: TarotCard;
  orientation: TarotOrientation;
  position: string;
  selectionIndex: number;
}): DrawnTarotCard {
  return {
    cardId: card.id,
    name: card.name,
    orientation,
    position,
    selectionIndex,
    imagePath: card.imagePath,
    keywords:
      orientation === "upright"
        ? card.keywordsUpright
        : card.keywordsReversed,
    shortMeaning:
      orientation === "upright"
        ? card.shortMeaningUpright
        : card.shortMeaningReversed,
  };
}

function getResponseLengthInstruction(question: string) {
  const trimmed = question.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  if (/^(okay|ok|yes|yeah|yep|thanks|thank you|interesting)$/i.test(trimmed)) {
    return "BRIEF: reply in roughly 15-45 words.";
  }

  if (
    /\b(explain in detail|go deeper|detailed|full interpretation|everything|compare all)\b/i.test(
      trimmed
    )
  ) {
    return "DEEP: reply in roughly 140-280 words.";
  }

  if (wordCount <= 2) {
    return "BRIEF: reply in roughly 20-70 words and focus on the existing spread.";
  }

  return "STANDARD: reply in roughly 60-150 words.";
}

export function buildTarotInitialPrompt({
  language,
  languageCode,
  firstName,
  question,
  spreadType,
  spreadName,
  cards,
  conversationText,
}: {
  language: string;
  languageCode: string;
  firstName?: string;
  question: string;
  spreadType: TarotSpreadType;
  spreadName: string;
  cards: DrawnTarotCard[];
  conversationText: string;
}) {
  const length =
    spreadType === "one-card"
      ? "One-card initial reading: approximately 70-150 words."
      : "Three-card initial reading: approximately 130-250 words.";

  return `
You are Bhagya, a warm and perceptive spiritual guide interpreting a Tarot spread that has already been securely drawn.

Selected language:
${language}

Selected language code:
${languageCode}

Saved first name:
${firstName || "there"}

User question:
${question}

Spread:
${spreadName}

Conversation context:
${conversationText}

Selected cards:
${JSON.stringify(cards, null, 2)}

Grounding:
* Use only the supplied cards, orientations, spread positions, question, and conversation context.
* Never add cards that were not selected.
* Never change card orientation.
* Treat Tarot as reflective spiritual guidance, not scientific certainty.
* Do not guarantee future outcomes.

Interpretation:
* Answer the user's actual question.
* Explain each card through its spread position.
* Connect the cards into one meaningful story; do not give disconnected dictionary definitions.
* Focus on the strongest insight first.
* Use the user's first name sparingly.
* Difficult cards such as Death or The Tower are symbolic, not literal disaster.

Style:
* Reply only in ${language}. For Hinglish, use Roman Hindi-English.
* Warm, intelligent, intriguing, calm, premium, lightly mystical, conversational.
* Do not make every sentence start with "The cards suggest".
* Ask at most one useful follow-up question, and only if it genuinely helps.

Length:
* ${length}
* Vary naturally according to the question. Do not pad the answer.

Safety:
* No medical diagnosis, death prediction, pregnancy/fertility prediction, guaranteed marriage date, guaranteed financial/legal outcome, or exact future certainty.

${getMessagingStyleInstruction("tarot")}
  `;
}

export function buildTarotFollowUpPrompt({
  language,
  languageCode,
  firstName,
  question,
  reading,
  conversationText,
}: {
  language: string;
  languageCode: string;
  firstName?: string;
  question: string;
  reading: TarotReadingSummary;
  conversationText: string;
}) {
  return `
You are Bhagya, continuing a Tarot conversation using an already revealed spread.

Selected language:
${language}

Selected language code:
${languageCode}

Saved first name:
${firstName || "there"}

Current user message:
${question}

Existing Tarot spread:
${JSON.stringify(reading, null, 2)}

Recent conversation:
${conversationText}

Rules:
* Use only this existing spread. Do not redraw cards or introduce new cards.
* If the user asks about "second card", use the second card in the saved spread.
* If the user says "career", "love", "okay", "yes", or "tell me more", infer the intent from recent conversation and this spread.
* Do not repeat the whole spread unless the user asks for a recap.
* Add a new angle connected to the user's exact message.
* Do not start every reply with the user's name.
* Do not repeatedly end with the same follow-up question.
* Keep uncertainty and avoid guaranteed predictions.
* ${getResponseLengthInstruction(question)}
* Reply only in ${language}. For Hinglish, use Roman Hindi-English.

${getMessagingStyleInstruction("tarot")}
  `;
}
