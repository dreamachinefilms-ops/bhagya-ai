import {
  buildBhagyaCorePrompt,
  createGuidanceResponsePlan,
  selectGuidanceResponseDepth,
  type GuidanceEvidence,
  type GuidanceHistoryMessage,
  type GuidanceResponseDepth,
} from "../guidance/promptCore.ts";
import type {
  DrawnTarotCard,
  TarotReadingSummary,
  TarotSpreadType,
} from "./reading.ts";

export function buildTarotEvidence(
  cards: DrawnTarotCard[],
): GuidanceEvidence[] {
  return cards.map((card) => ({
    source: card.position,
    value: `${card.name} (${card.orientation}): ${card.shortMeaning}`,
    confidence: 1,
  }));
}

function buildTarotRules({
  question,
  spreadName,
  cards,
}: {
  question: string;
  spreadName: string;
  cards: DrawnTarotCard[];
}) {
  return `
Original question:
${question}

Active spread: ${spreadName}

Exact selected cards, orientations, and positions:
${JSON.stringify(cards, null, 2)}

Tarot grounding rules:
- Use only these selected cards, their saved orientations, positions, and the original question.
- Never introduce, imply, or redraw another card.
- If the user refers to the first, second, or third card, follow the saved spread order exactly.
- Interpret each card through its position and connect the spread into one coherent answer rather than listing dictionary meanings.
- Difficult cards such as Death or The Tower are symbolic, not literal disaster.
- Tarot reflects the present situation and possible direction; it does not guarantee an outcome.
  `.trim();
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
  historyMessages,
  responseDepth,
}: {
  language: string;
  languageCode: string;
  firstName?: string | null;
  question: string;
  spreadType: TarotSpreadType;
  spreadName: string;
  cards: DrawnTarotCard[];
  conversationText: string;
  historyMessages: GuidanceHistoryMessage[];
  responseDepth?: GuidanceResponseDepth;
}) {
  const depth: GuidanceResponseDepth = responseDepth ||
    (spreadType === "three-card" ? "deep" : "standard");
  const evidence = buildTarotEvidence(cards);
  const plan = createGuidanceResponsePlan({
    service: "tarot",
    userMessage: question,
    relevantEvidence: evidence,
    history: historyMessages,
    useFirstName: Boolean(firstName),
    responseLength: depth,
  });

  return {
    depth,
    evidence,
    instructions: `
${buildBhagyaCorePrompt({
  service: "tarot",
  language,
  firstName,
  plan,
})}

Tarot language code: ${languageCode}

${buildTarotRules({ question, spreadName, cards })}

Conversation context:
${conversationText}

Initial reading rules:
- Lead with the strongest spread-specific message for the user's question.
- Explain the role of every selected card without padding or repeating the same meaning.
- Use the first name only if it is permitted in the shared response plan.
    `.trim(),
  };
}

export function buildTarotFollowUpPrompt({
  language,
  languageCode,
  firstName,
  question,
  reading,
  conversationText,
  historyMessages,
  responseDepth,
}: {
  language: string;
  languageCode: string;
  firstName?: string | null;
  question: string;
  reading: TarotReadingSummary;
  conversationText: string;
  historyMessages: GuidanceHistoryMessage[];
  responseDepth?: GuidanceResponseDepth;
}) {
  const depth = responseDepth || selectGuidanceResponseDepth(question);
  const evidence = buildTarotEvidence(reading.cards);
  const plan = createGuidanceResponsePlan({
    service: "tarot",
    userMessage: question,
    relevantEvidence: evidence,
    history: historyMessages,
    useFirstName: Boolean(firstName),
    responseLength: depth,
  });

  return {
    depth,
    evidence,
    instructions: `
${buildBhagyaCorePrompt({
  service: "tarot",
  language,
  firstName,
  plan,
})}

Tarot language code: ${languageCode}

${buildTarotRules({
  question: reading.question,
  spreadName: reading.spreadName,
  cards: reading.cards,
})}

Saved initial interpretation:
${reading.interpretation}

Recent active Tarot conversation:
${conversationText}

Current follow-up:
${question}

Follow-up rules:
- Answer the current message from a new relevant angle in the existing spread.
- For "okay", acknowledge briefly. For "tell me more", continue the latest thread. For a one-word topic, connect only the most relevant card or cards.
- Do not repeat the complete spread unless the user requests a recap.
- Do not present a card meaning as a guaranteed event.
    `.trim(),
  };
}
