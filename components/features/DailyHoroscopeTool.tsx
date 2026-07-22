"use client";
import { useState } from "react";
import ProfileSummary from "./ProfileSummary";
import { authenticatedPost } from "./featureClient";
import type { DailyHoroscopeResult } from "@/lib/horoscope/types";

export default function DailyHoroscopeTool() {
  const [result, setResult] = useState<DailyHoroscopeResult | null>(null);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function generate() { setLoading(true); setError(""); try { const data = await authenticatedPost<{ result: DailyHoroscopeResult }>("/api/horoscope/daily", { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, language: "en" }); setResult(data.result); } catch (e) { setError(e instanceof Error ? e.message : "Your horoscope could not be generated. Please try again."); } finally { setLoading(false); } }
  return <div className="space-y-6"><ProfileSummary />{!result && <button onClick={generate} disabled={loading} className="min-h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 font-semibold disabled:opacity-60">{loading ? "Reading today’s planetary patterns…" : "Generate Today’s Horoscope"}</button>}{error && <p role="alert" className="rounded-xl border border-rose-300/20 bg-rose-300/[.06] p-4 text-sm text-rose-100">{error}</p>}{result && <div className="space-y-5"><section className="rounded-3xl border border-sky-300/15 bg-sky-300/[.05] p-6"><p className="text-xs uppercase tracking-widest text-sky-300">Today’s Energy · {result.date}</p><h2 className="mt-3 text-2xl font-semibold">{result.zodiacSign || "Personal guidance"}</h2><p className="mt-3 leading-7 text-white/65">{result.overview}</p></section><div className="grid gap-4 sm:grid-cols-2">{Object.entries(result.themes).map(([key, value]) => <ResultCard key={key} title={key}>{value}</ResultCard>)}</div><div className="grid gap-4 sm:grid-cols-2"><ResultCard title="Focus of the Day">{result.focusOfTheDay}</ResultCard><ResultCard title="Be Mindful Of">{result.caution}</ResultCard></div><p className="text-sm leading-6 text-white/40">{result.groundingNote}</p><button onClick={generate} disabled={loading} className="text-sm font-medium text-sky-300 hover:underline">Reload today’s saved reading</button></div>}</div>;
}
function ResultCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-white/10 bg-[#071225]/85 p-5"><h3 className="capitalize font-semibold text-white/85">{title}</h3><p className="mt-2 leading-7 text-white/50">{children}</p></section>; }
