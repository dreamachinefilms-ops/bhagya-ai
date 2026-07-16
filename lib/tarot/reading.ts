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
