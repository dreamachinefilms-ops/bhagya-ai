import PublicPageShell from "@/components/layout/PublicPageShell";
import KundliMatchingTool from "@/components/features/KundliMatchingTool";

export default function KundliMatchingPage() {
  return <PublicPageShell><div className="mx-auto max-w-6xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-sky-300/65">Compare two birth charts</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Kundli Matching</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-white/50">Enter or adjust the birth details for both people. We’ll compare the two Kundlis and explain compatibility strengths and areas that may need understanding.</p><div className="mt-9"><KundliMatchingTool /></div><p className="mt-6 max-w-4xl text-sm leading-6 text-white/35">Bhagya shows Guna scores, matching categories and Manglik analysis only when returned by a verified astrology provider. No score is estimated by AI.</p></div></PublicPageShell>;
}
