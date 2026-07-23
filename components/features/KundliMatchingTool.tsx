"use client";
import { useState } from "react";
import ProfileSummary from "./ProfileSummary";
import SecondPersonFields, { emptySecondPerson } from "./SecondPersonFields";
import { authenticatedPost } from "./featureClient";
import type { SecondPersonInput } from "@/lib/horoscope/types";

export default function KundliMatchingTool() {
  const [second, setSecond] = useState<SecondPersonInput>(emptySecondPerson); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function submit(e: React.FormEvent) { e.preventDefault(); setLoading(true); setError(""); try { await authenticatedPost("/api/kundli-matching", { secondPerson: second }); } catch (e) { setError(e instanceof Error ? e.message : "The Kundli comparison could not be completed."); } finally { setLoading(false); } }
  return <div className="space-y-6"><section><h2 className="mb-3 text-lg font-semibold">Person 1 · Your locked birth profile</h2><ProfileSummary /></section><form onSubmit={submit} className="space-y-5 rounded-3xl border border-white/10 bg-[#071225]/85 p-6"><div><h2 className="text-lg font-semibold">Person 2</h2><p className="mt-1 text-sm text-white/40">Used for this request only and not saved.</p></div><SecondPersonFields value={second} onChange={setSecond} /><button disabled={loading} className="min-h-12 rounded-xl bg-gradient-to-r from-[#08b7f2] to-[#2563eb] px-5 font-semibold text-white shadow-[0_14px_36px_rgba(34,199,242,0.22)] transition hover:brightness-110 active:brightness-95 disabled:opacity-60">{loading ? "Comparing both birth charts…" : "Match Kundlis"}</button>{error && <p role="alert" className="rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">{error}</p>}</form><p className="text-sm leading-6 text-white/35">Bhagya shows Guna scores, matching categories and Manglik analysis only when returned by a verified astrology provider. No score is estimated by AI.</p></div>;
}
