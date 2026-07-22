import PublicPageShell from "@/components/layout/PublicPageShell";
import AstrologyChatLink from "@/components/navigation/AstrologyChatLink";

export default function LoveHoroscopePage() {
  return <PublicPageShell><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-sky-300/65">Relationships and reflection</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Love Horoscope</h1><p className="mt-5 text-lg leading-8 text-white/50">Explore emotional patterns, relationship timing and the influences surrounding your love life.</p><div className="mt-8 rounded-3xl border border-white/10 bg-[#071225]/85 p-6 sm:p-8"><h2 className="text-xl font-semibold">Personalised Astrology guidance</h2><p className="mt-3 leading-7 text-white/45">This opens the existing Astrology conversation using your available birth-profile context. Bhagya offers reflective guidance and does not present another person’s feelings as fact.</p><div className="mt-6"><AstrologyChatLink prompt="Give me personalised guidance about my love life.">Read My Love Horoscope</AstrologyChatLink></div></div></div></PublicPageShell>;
}
