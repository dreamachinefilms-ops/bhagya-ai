import PublicPageShell from "@/components/layout/PublicPageShell";
import DailyHoroscopeTool from "@/components/features/DailyHoroscopeTool";

export default function DailyHoroscopePage() {
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  return <PublicPageShell><div className="mx-auto max-w-4xl"><p className="text-sm text-sky-300/65">{date}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Daily Horoscope</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-white/50">A private, structured daily reflection based on your saved birth profile. This page never opens the chat composer.</p><div className="mt-8"><DailyHoroscopeTool /></div></div></PublicPageShell>;
}
