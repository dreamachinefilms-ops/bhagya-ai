"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import type { BhagyaLanguage, BhagyaService, ResponseDetail } from "@/lib/userPreferences";

type Section = "profile" | "birth" | "preferences" | "privacy" | "account";
type ProfileData = { fullName: string; firstName: string; email: string; createdAt: string; birthDetails: null | { dateOfBirth: string; birthTime: string; birthTimeKnown: boolean; birthPlace: string } };
const sections: Array<[Section, string]> = [["profile", "Profile"], ["birth", "Birth Details"], ["preferences", "Preferences"], ["privacy", "Privacy"], ["account", "Account"]];

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } : null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { preferences, isLoading: preferencesLoading, isSaving, error: preferencesError, isAuthenticated, updatePreferences } = useUserPreferences();
  const [section, setSection] = useState<Section>("profile");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileForm, setProfileForm] = useState({ fullName: "", firstName: "" });
  const [birthForm, setBirthForm] = useState({ dateOfBirth: "", birthTime: "", birthTimeKnown: true, birthPlace: "" });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect the server-backed timezone after preferences hydrate
    setTimezoneDraft(preferences.timezone || "");
  }, [preferences.timezone]);

  useEffect(() => {
    let active = true;
    (async () => {
      const auth = await headers();
      if (!auth) { if (!preferencesLoading) router.replace("/login?next=/settings"); return; }
      try {
        const response = await fetch("/api/profile", { headers: auth });
        const data = await response.json() as { profile?: ProfileData };
        if (!response.ok || !data.profile) throw new Error();
        if (active) { setProfile(data.profile); setProfileForm({ fullName: data.profile.fullName, firstName: data.profile.firstName }); if (data.profile.birthDetails) setBirthForm(data.profile.birthDetails); }
      } catch { if (active) setStatus("Your profile could not be loaded. Please try again."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [preferencesLoading, router]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setStatus("Saving…");
    const auth = await headers(); if (!auth) return setStatus("Your session has expired. Please sign in again.");
    const response = await fetch("/api/profile", { method: "PATCH", headers: auth, body: JSON.stringify(profileForm) });
    const data = await response.json() as { profile?: ProfileData; message?: string };
    if (!response.ok) return setStatus(data.message || "Your profile could not be updated. Please try again.");
    setProfile((current) => current && data.profile ? { ...current, ...data.profile } : current); setStatus("Saved");
  }

  async function saveBirth(event: FormEvent) {
    event.preventDefault(); setStatus("Saving…");
    const auth = await headers(); if (!auth) return setStatus("Your session has expired. Please sign in again.");
    try {
      const response = await fetch("/api/birth-details", { method: "POST", headers: auth, body: JSON.stringify({ ...birthForm, fullName: profileForm.fullName }) });
      const data = await response.json() as { message?: string };
      setStatus(response.ok ? "Saved" : data.message || "Your birth details could not be updated.");
    } catch { setStatus("Please check your connection and try again."); }
  }

  async function setPreference(patch: Parameters<typeof updatePreferences>[0]) { try { await updatePreferences(patch); setStatus("Saved"); } catch { setStatus(""); } }
  async function signOut() { await supabase.auth.signOut(); router.replace("/"); }
  const initials = (profile?.firstName || profile?.fullName || "B").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  if (loading || preferencesLoading) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#020817] text-white/60">Loading your settings…</main>;
  if (!isAuthenticated) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#020817] px-5 text-center text-white"><div><p>Your session has expired. Please sign in again.</p><Link href="/login?next=/settings" className="mt-4 inline-block text-sky-300">Sign in</Link></div></main>;

  return <main className="min-h-[100dvh] overflow-x-hidden bg-[#020817] px-[max(16px,env(safe-area-inset-left))] pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,.13),transparent_40%)]" />
    <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-col">
      <header className="flex items-center gap-3 py-3"><Link href="/" aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl">←</Link><div><p className="text-xs uppercase tracking-[.2em] text-sky-300/70">Bhagya.ai</p><h1 className="text-2xl font-semibold">Profile & Settings</h1></div></header>
      <div className="mt-4 grid min-h-0 gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="scrollbar-hide flex gap-2 overflow-x-auto md:flex-col">{sections.map(([id, label]) => <button key={id} onClick={() => { setSection(id); setStatus(""); }} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm transition ${section === id ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30" : "text-white/55 hover:bg-white/5"}`}>{label}</button>)}</nav>
        <section className="min-h-0 rounded-[24px] border border-white/10 bg-[#071225]/90 p-4 shadow-2xl backdrop-blur-xl sm:p-7">
          {(status || preferencesError || isSaving) && <p role="status" className="mb-4 rounded-xl border border-sky-400/15 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">{isSaving ? "Saving…" : preferencesError || status}</p>}
          {section === "profile" && <form onSubmit={saveProfile} className="space-y-5"><div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-700 text-xl font-bold">{initials}</div><div><h2 className="text-xl font-semibold">{profile?.fullName || "Your profile"}</h2><p className="text-sm text-white/45">{profile?.email}</p></div></div><Field label="Full name" value={profileForm.fullName} onChange={(fullName) => setProfileForm((v) => ({ ...v, fullName }))} maxLength={100} required /><Field label="Preferred first name" value={profileForm.firstName} onChange={(firstName) => setProfileForm((v) => ({ ...v, firstName }))} maxLength={100} required /><ReadOnly label="Email" value={profile?.email || ""} /><ReadOnly label="Member since" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "Not available"} /><SaveButton /></form>}
          {section === "birth" && <form onSubmit={saveBirth} className="space-y-5"><Heading title="Birth Details" text="These details power your spiritual calculations. Existing chats remain unchanged." /><Field label="Full name used for calculations" value={profileForm.fullName} onChange={(fullName) => setProfileForm((v) => ({ ...v, fullName }))} maxLength={100} required /><Field label="Date of birth" type="date" value={birthForm.dateOfBirth} onChange={(dateOfBirth) => setBirthForm((v) => ({ ...v, dateOfBirth }))} max={new Date().toISOString().slice(0, 10)} required /><Field label="Birth time" type="time" value={birthForm.birthTime} onChange={(birthTime) => setBirthForm((v) => ({ ...v, birthTime }))} disabled={!birthForm.birthTimeKnown} required={birthForm.birthTimeKnown} /><label className="flex min-h-11 items-center gap-3 text-sm text-white/70"><input type="checkbox" checked={!birthForm.birthTimeKnown} onChange={(e) => setBirthForm((v) => ({ ...v, birthTimeKnown: !e.target.checked, birthTime: e.target.checked ? "" : v.birthTime }))} />I don’t know my exact birth time</label><Field label="Birth place" value={birthForm.birthPlace} onChange={(birthPlace) => setBirthForm((v) => ({ ...v, birthPlace }))} maxLength={120} required /><SaveButton /></form>}
          {section === "preferences" && <div className="space-y-6"><Heading title="Preferences" text="Saved privately to your Bhagya account and restored on every device." /><Select label="Language" value={preferences.language} onChange={(value) => void setPreference({ language: value as BhagyaLanguage })} options={[["en", "English"], ["hi", "Hindi"]]} /><Select label="Default service" value={preferences.defaultService} onChange={(value) => void setPreference({ defaultService: value as BhagyaService })} options={[["astrology", "Astrology"], ["numerology", "Numerology"], ["tarot", "Tarot"], ["palmistry", "Palmistry"]]} /><Select label="Preferred response detail" value={preferences.responseDetail} onChange={(value) => void setPreference({ responseDetail: value as ResponseDetail })} options={[["concise", "Concise"], ["balanced", "Balanced"], ["detailed", "Detailed"]]} /><Field label="Timezone" value={timezoneDraft} onChange={setTimezoneDraft} placeholder="Asia/Kolkata" list="timezones" /><datalist id="timezones"><option value="Asia/Kolkata"/><option value="UTC"/><option value="America/New_York"/><option value="Europe/London"/></datalist><div className="flex flex-wrap gap-4"><button type="button" onClick={() => { const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; setTimezoneDraft(timezone); void setPreference({ timezone }); }} className="text-sm text-sky-300">Use this device’s timezone</button><button type="button" onClick={() => void setPreference({ timezone: timezoneDraft || null })} className="text-sm font-medium text-sky-200">Save timezone</button></div></div>}
          {section === "privacy" && <div className="space-y-6"><Heading title="Privacy" text="Control how stored conversations are used without deleting your history." /><label className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-4"><span><span className="block font-medium">Conversation Personalization</span><span className="mt-1 block text-sm leading-6 text-white/45">When enabled, Bhagya may use relevant earlier messages from the same service to keep the conversation connected.</span></span><input type="checkbox" checked={preferences.useChatPersonalization} onChange={(e) => void setPreference({ useChatPersonalization: e.target.checked })} className="mt-1 h-5 w-5" /></label><div><h3 className="font-medium">Stored Data Summary</h3><p className="mt-2 text-sm leading-7 text-white/50">Your account may contain a birth profile, chats and messages, Palmistry images, Tarot readings, and a Numerology profile. Turning personalization off does not delete them.</p></div><p className="rounded-xl border border-white/10 p-3 text-sm text-white/45">Individual chats remain managed from your conversation history. No destructive control is shown here because the app does not yet have a verified chat-deletion endpoint.</p></div>}
          {section === "account" && <div className="space-y-6"><Heading title="Account" text="Your authenticated account details." /><ReadOnly label="Email" value={profile?.email || ""} /><button onClick={() => void signOut()} className="min-h-12 rounded-xl bg-white/10 px-5 font-medium hover:bg-white/15">Sign Out</button><div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4"><h3 className="font-medium text-rose-200">Delete Account</h3><p className="mt-2 text-sm leading-6 text-white/45">Account deletion is unavailable until a server-side Supabase admin function and verified Storage cleanup are configured. Your data will not be placed at risk by an incomplete action.</p></div></div>}
        </section>
      </div>
    </div>
  </main>;
}

function Heading({ title, text }: { title: string; text: string }) { return <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-white/45">{text}</p></div>; }
function Field({ label, value, onChange, type = "text", ...props }: { label: string; value: string; onChange: (value: string) => void; type?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) { return <label className="block text-sm text-white/65">{label}<input {...props} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#020817]/70 px-3 text-base text-white outline-none focus:border-sky-400/50 disabled:opacity-40" /></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wider text-white/35">{label}</p><p className="mt-1 break-all text-sm text-white/70">{value}</p></div>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="block text-sm text-white/65">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#020817] px-3 text-base text-white">{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>; }
function SaveButton() { return <button type="submit" className="min-h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 font-semibold shadow-lg shadow-sky-900/30">Save Changes</button>; }
