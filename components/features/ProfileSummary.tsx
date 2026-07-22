"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useSettingsProfile } from "@/components/providers/SettingsProfileProvider";

export default function ProfileSummary() {
  const { profile, status, loadProfile } = useSettingsProfile();
  useEffect(() => { void loadProfile(); }, [loadProfile]);
  if (status === "loading" || status === "idle") return <p className="text-sm text-white/40">Loading your saved birth profile…</p>;
  if (!profile?.birthDetails) return <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100/80">Complete your birth profile to receive personalised guidance. <Link href="/settings?section=birth-profile" className="ml-1 font-semibold text-sky-300 hover:underline">Complete Birth Profile</Link></div>;
  const birth = profile.birthDetails;
  return <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm text-white/55 sm:grid-cols-2"><p><span className="text-white/30">Name</span><br />{birth.fullName || profile.fullName}</p><p><span className="text-white/30">Born</span><br />{birth.dateOfBirth}{birth.birthTimeKnown ? ` at ${birth.birthTime}` : " · time unknown"}</p><p className="sm:col-span-2"><span className="text-white/30">Birth place</span><br />{birth.birthPlace}</p></div>;
}
