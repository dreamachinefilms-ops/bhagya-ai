export type DailyHoroscopeResult = {
  date: string;
  firstName: string | null;
  zodiacSign: string | null;
  overview: string;
  themes: { career: string; love: string; money: string; wellbeing: string };
  focusOfTheDay: string;
  caution: string;
  favourableTime: string | null;
  luckyColour: string | null;
  luckyNumber: number | null;
  groundingNote: string;
  generatedAt: string;
  sourceMode: "prokerala" | "calculated-astrology" | "birth-profile-guidance";
};

export type SecondPersonInput = {
  fullName: string;
  dateOfBirth: string;
  birthTime: string;
  birthTimeKnown: boolean;
  birthPlace: string;
};
