import PublicPageShell from "@/components/layout/PublicPageShell";
import KundliMatchingTool from "@/components/features/KundliMatchingTool";

export default function KundliMatchingPage() {
  return <PublicPageShell><div className="mx-auto max-w-4xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-amber-300/65">Two birth charts</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Kundli Matching</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-white/50">Enter the second person’s details to request a verified compatibility analysis. Your saved profile remains read-only.</p><div className="mt-9"><KundliMatchingTool /></div></div></PublicPageShell>;
}
