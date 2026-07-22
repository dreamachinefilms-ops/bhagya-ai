import PublicPageShell from "@/components/layout/PublicPageShell";
import AstrologyChatLink from "@/components/navigation/AstrologyChatLink";

export default function DailyHoroscopePage() {
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  return <PublicPageShell><div className="max-w-3xl"><p className="text-sm text-sky-300/65">{date}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Daily Horoscope</h1><p className="mt-5 text-lg leading-8 text-white/50">Discover the themes, opportunities and cautions influencing your day through Bhagya’s existing Astrology guidance.</p><div className="mt-8 rounded-3xl border border-white/10 bg-[#071225]/85 p-6 sm:p-8"><h2 className="text-xl font-semibold">Personal guidance from your saved birth profile</h2><p className="mt-3 leading-7 text-white/45">Bhagya uses the Astrology conversation and available kundli data. It does not claim precise live transits when those calculations are unavailable.</p><div className="mt-6"><AstrologyChatLink prompt="Give me my personalised horoscope for today.">Read My Daily Horoscope</AstrologyChatLink></div><p className="mt-4 text-xs leading-5 text-white/30">If your birth profile is incomplete, Bhagya will guide you to finish it before producing personalised guidance.</p></div></div></PublicPageShell>;
}
