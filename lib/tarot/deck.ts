export type TarotSuit = "wands" | "cups" | "swords" | "pentacles";
export type TarotOrientation = "upright" | "reversed";

export type TarotCard = {
  id: string;
  name: string;
  arcana: "major" | "minor";
  number?: number;
  suit?: TarotSuit;
  imagePath: string;
  keywordsUpright: string[];
  keywordsReversed: string[];
  shortMeaningUpright: string;
  shortMeaningReversed: string;
};

const majorCards = [
  ["the-fool", "The Fool", 0, ["new beginning", "trust", "fresh start"], ["naivety", "hesitation", "risk"], "A fresh opening asks for trust and curiosity.", "A fresh opening needs more grounding before a leap."],
  ["the-magician", "The Magician", 1, ["will", "skill", "manifestation"], ["scattered energy", "blocked will", "misuse"], "Focused intention can turn resources into action.", "Your power is present, but it needs clearer direction."],
  ["the-high-priestess", "The High Priestess", 2, ["intuition", "mystery", "inner knowing"], ["withholding", "confusion", "ignored intuition"], "Quiet intuition is giving the real clue.", "The answer may be hidden because you are overriding your instincts."],
  ["the-empress", "The Empress", 3, ["growth", "nurture", "abundance"], ["overgiving", "stagnation", "dependency"], "Something grows when it is cared for steadily.", "Care is needed, but not at the cost of your own balance."],
  ["the-emperor", "The Emperor", 4, ["structure", "authority", "stability"], ["control", "rigidity", "instability"], "Clear structure and boundaries bring stability.", "Too much control may be blocking a calmer solution."],
  ["the-hierophant", "The Hierophant", 5, ["tradition", "mentor", "values"], ["rebellion", "old rules", "misalignment"], "Guidance comes through values, tradition, or a trusted mentor.", "An old rule may no longer fit your spirit."],
  ["the-lovers", "The Lovers", 6, ["choice", "union", "values"], ["misalignment", "temptation", "disharmony"], "A heart-level choice asks for honest alignment.", "The choice becomes harder when values are not fully aligned."],
  ["the-chariot", "The Chariot", 7, ["drive", "victory", "direction"], ["force", "drift", "pressure"], "Direction and discipline can move this forward.", "Pushing harder may not help until your direction is clear."],
  ["strength", "Strength", 8, ["courage", "patience", "soft power"], ["self-doubt", "impatience", "inner tension"], "Gentle courage is stronger than force here.", "The challenge is not weakness; it is trusting your inner steadiness."],
  ["the-hermit", "The Hermit", 9, ["reflection", "wisdom", "solitude"], ["isolation", "withdrawal", "lost guidance"], "A quieter answer appears when you step back.", "Too much withdrawal may be turning reflection into avoidance."],
  ["wheel-of-fortune", "Wheel of Fortune", 10, ["change", "timing", "cycles"], ["delay", "resistance", "bad timing"], "A cycle is turning, and timing matters.", "The timing may be shifting, so flexibility matters more than control."],
  ["justice", "Justice", 11, ["truth", "balance", "karma"], ["imbalance", "avoidance", "unfairness"], "Truth, fairness, and accountability shape the outcome.", "Something feels off because the balance has not been restored."],
  ["the-hanged-man", "The Hanged Man", 12, ["pause", "surrender", "new view"], ["stuckness", "resistance", "delay"], "A pause can reveal a wiser angle.", "Staying suspended too long may become avoidance."],
  ["death", "Death", 13, ["ending", "transition", "release"], ["resistance", "unfinished ending", "fear of change"], "This is more about transition than loss.", "A needed ending is being delayed by attachment."],
  ["temperance", "Temperance", 14, ["balance", "healing", "patience"], ["excess", "imbalance", "rushing"], "Patience and moderation create the path forward.", "The energy needs balance before it can settle."],
  ["the-devil", "The Devil", 15, ["attachment", "desire", "pattern"], ["release", "awareness", "breaking chains"], "A binding pattern needs honest recognition.", "Awareness is already loosening an old attachment."],
  ["the-tower", "The Tower", 16, ["breakthrough", "shake-up", "truth"], ["fear of change", "delayed shift", "inner disruption"], "A sudden truth can clear what was unstable.", "The shake-up may be internal before it becomes visible."],
  ["the-star", "The Star", 17, ["hope", "renewal", "faith"], ["discouragement", "healing needed", "doubt"], "Hope returns through healing and trust.", "Faith is present, but it needs gentler care."],
  ["the-moon", "The Moon", 18, ["uncertainty", "dreams", "illusion"], ["clarity emerging", "fear", "confusion"], "Not everything is visible yet; move carefully.", "Confusion can lift if you stop feeding the fear."],
  ["the-sun", "The Sun", 19, ["joy", "clarity", "success"], ["muted joy", "delay", "low confidence"], "Warmth, clarity, and confidence support this path.", "The light is there, but confidence may be temporarily muted."],
  ["judgement", "Judgement", 20, ["awakening", "calling", "decision"], ["self-doubt", "avoidance", "unfinished lesson"], "A deeper calling asks you to rise honestly.", "A decision is delayed because an old lesson still needs acceptance."],
  ["the-world", "The World", 21, ["completion", "integration", "fulfilment"], ["incomplete cycle", "delay", "loose ends"], "A cycle is completing and asking for integration.", "The ending is close, but a loose end needs attention."],
] as const;

const suitThemes: Record<TarotSuit, { upright: string[]; reversed: string[]; meaning: string; reversedMeaning: string }> = {
  wands: {
    upright: ["energy", "ambition", "action"],
    reversed: ["delay", "burnout", "scattered fire"],
    meaning: "Creative fire wants movement and courage.",
    reversedMeaning: "The fire is present, but it needs pacing and direction.",
  },
  cups: {
    upright: ["emotion", "intuition", "connection"],
    reversed: ["emotional block", "overwhelm", "withdrawal"],
    meaning: "Emotional truth and intuition guide this situation.",
    reversedMeaning: "Feelings need space before they become clear.",
  },
  swords: {
    upright: ["thought", "truth", "decision"],
    reversed: ["confusion", "mental noise", "avoidance"],
    meaning: "Clarity comes through honest thinking and direct truth.",
    reversedMeaning: "Mental pressure needs clearing before a decision feels clean.",
  },
  pentacles: {
    upright: ["stability", "work", "resources"],
    reversed: ["instability", "delay", "misplaced effort"],
    meaning: "Practical effort and steady choices matter most.",
    reversedMeaning: "The practical path needs adjustment before it can stabilize.",
  },
};

const ranks = [
  ["ace", "Ace", 1],
  ["two", "Two", 2],
  ["three", "Three", 3],
  ["four", "Four", 4],
  ["five", "Five", 5],
  ["six", "Six", 6],
  ["seven", "Seven", 7],
  ["eight", "Eight", 8],
  ["nine", "Nine", 9],
  ["ten", "Ten", 10],
  ["page", "Page", 11],
  ["knight", "Knight", 12],
  ["queen", "Queen", 13],
  ["king", "King", 14],
] as const;

function minorKeywords(rankName: string, suit: TarotSuit) {
  const theme = suitThemes[suit];

  return {
    upright: [rankName.toLowerCase(), ...theme.upright].slice(0, 4),
    reversed: [rankName.toLowerCase(), ...theme.reversed].slice(0, 4),
  };
}

export const tarotDeck: TarotCard[] = [
  ...majorCards.map(([slug, name, number, upright, reversed, meaning, reversedMeaning]) => ({
    id: `major-${slug}`,
    name,
    arcana: "major" as const,
    number,
    imagePath: `/tarot/cards/major-${slug}.webp`,
    keywordsUpright: [...upright],
    keywordsReversed: [...reversed],
    shortMeaningUpright: meaning,
    shortMeaningReversed: reversedMeaning,
  })),
  ...(["wands", "cups", "swords", "pentacles"] as TarotSuit[]).flatMap((suit) =>
    ranks.map(([rankSlug, rankName, number]) => {
      const keywords = minorKeywords(rankName, suit);
      const cardName = `${rankName} of ${suit[0].toUpperCase()}${suit.slice(1)}`;
      const id = `${suit}-${rankSlug}`;

      return {
        id,
        name: cardName,
        arcana: "minor" as const,
        number,
        suit,
        imagePath: `/tarot/cards/${id}.webp`,
        keywordsUpright: keywords.upright,
        keywordsReversed: keywords.reversed,
        shortMeaningUpright: `${cardName} says ${suitThemes[suit].meaning}`,
        shortMeaningReversed: `${cardName} reversed says ${suitThemes[suit].reversedMeaning}`,
      };
    })
  ),
];

export function getTarotCard(cardId: string) {
  return tarotDeck.find((card) => card.id === cardId) || null;
}

export function getTarotCards(cardIds: string[]) {
  return cardIds.map(getTarotCard);
}
