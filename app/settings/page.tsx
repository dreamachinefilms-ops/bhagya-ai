"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSettingsProfile, type ProfileData } from "@/components/providers/SettingsProfileProvider";
import type { BhagyaLanguage, BhagyaService, ResponseDetail } from "@/lib/userPreferences";

type Section = "profile" | "birth" | "preferences" | "privacy" | "account";
const sections: Array<[Section, string]> = [["profile", "Profile"], ["birth", "Birth Details"], ["preferences", "Preferences"], ["privacy", "Privacy"], ["account", "Account"]];

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } : null;
}

export default function SettingsPage() {
  const router = useRouter();
  const { preferences, isLoading: preferencesLoading, hasLoaded: hasLoadedPreferences, isSaving, error: preferencesError, isAuthenticated, updatePreferences, refreshPreferences } = useUserPreferences();
  const { profile, sessionUser, status: profileStatus, hasLoaded: hasLoadedProfile, error: profileError, loadProfile, updateCachedProfile, clearProfile } = useSettingsProfile();
  const [section, setSection] = useState<Section>("profile");
  const [profileForm, setProfileForm] = useState({ fullName: "", firstName: "" });
  const [status, setStatus] = useState("");
  const [timezoneDraft, setTimezoneDraft] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect the server-backed timezone after preferences hydrate
    if (hasLoadedPreferences) setTimezoneDraft(preferences.timezone || "");
  }, [hasLoadedPreferences, preferences.timezone]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the editable draft when the account-scoped cache updates
    if (profile) setProfileForm({ fullName: profile.fullName, firstName: profile.firstName });
  }, [profile]);

  useEffect(() => {
    if (!preferencesLoading && !isAuthenticated && profileStatus === "error") router.replace("/login?next=/settings");
  }, [isAuthenticated, preferencesLoading, profileStatus, router]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setStatus("Saving…");
    const auth = await headers(); if (!auth) return setStatus("Your session has expired. Please sign in again.");
    const response = await fetch("/api/profile", { method: "PATCH", headers: auth, body: JSON.stringify(profileForm) });
    const data = await response.json() as { profile?: ProfileData; message?: string };
    if (!response.ok) return setStatus(data.message || "Your profile could not be updated. Please try again.");
    if (profile && data.profile) updateCachedProfile({ ...profile, ...data.profile }); setStatus("Saved");
  }

  async function setPreference(patch: Parameters<typeof updatePreferences>[0]) { try { await updatePreferences(patch); setStatus("Saved"); } catch { setStatus(""); } }
  async function signOut() { clearProfile(); await supabase.auth.signOut(); router.replace("/"); }
  const displayName = profile?.fullName || sessionUser?.fullName || "";
  const displayEmail = profile?.email || sessionUser?.email || "";
  const initials = (profile?.firstName || displayName).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const profileColdLoading = !hasLoadedProfile && (profileStatus === "idle" || profileStatus === "loading");
  const preferencesColdLoading = !hasLoadedPreferences && preferencesLoading;
  const preferencesUnavailable = !hasLoadedPreferences && Boolean(preferencesError);
  const sessionExpired = !preferencesLoading && !isAuthenticated && profileStatus === "error";

  return <main className="min-h-[100dvh] overflow-x-hidden bg-[#020817] px-[max(16px,env(safe-area-inset-left))] pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,.13),transparent_40%)]" />
    <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-col">
      <header className="flex items-center gap-3 py-3"><Link href="/" aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl">←</Link><div><p className="text-xs uppercase tracking-[.2em] text-sky-300/70">Bhagya</p><h1 className="text-2xl font-semibold">Settings</h1></div></header>
      <div className="mt-4 grid min-h-0 gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="scrollbar-hide flex gap-2 overflow-x-auto md:flex-col">{sections.map(([id, label]) => <button key={id} onClick={() => { setSection(id); setStatus(""); }} className={`min-h-11 shrink-0 rounded-xl px-4 text-left text-sm transition ${section === id ? "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30" : "text-white/55 hover:bg-white/5"}`}>{label}</button>)}</nav>
        <section className="min-h-0 rounded-[24px] border border-white/10 bg-[#071225]/90 p-4 shadow-2xl backdrop-blur-xl sm:p-7">
          {sessionExpired && <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-sm text-amber-100"><p>Your session has expired. Please sign in again.</p><Link href="/login?next=/settings" className="mt-2 inline-block font-medium text-sky-300">Sign in</Link></div>}
          {(status || (section === "preferences" && isSaving)) && <p role="status" className="mb-4 rounded-xl border border-sky-400/15 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">{section === "preferences" && isSaving ? "Saving…" : status}</p>}
          {section === "profile" && <form onSubmit={saveProfile} className="space-y-5">{profileError && !hasLoadedProfile && <SectionError message="Your profile could not be loaded." onRetry={() => void loadProfile()} />}<div className="flex items-center gap-4"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-700 text-xl font-bold">{initials || "—"}</div><div><h2 className="text-xl font-semibold">{displayName || "Your profile"}</h2><p className="min-h-5 text-sm text-white/45">{displayEmail || "—"}</p></div></div><Field label="Full name" value={profileForm.fullName} onChange={(fullName) => setProfileForm((v) => ({ ...v, fullName }))} placeholder={profileColdLoading ? "—" : undefined} disabled={!profile} maxLength={100} required /><Field label="Preferred first name" value={profileForm.firstName} onChange={(firstName) => setProfileForm((v) => ({ ...v, firstName }))} placeholder={profileColdLoading ? "—" : undefined} disabled={!profile} maxLength={100} required /><ReadOnly label="Email" value={displayEmail || "—"} /><ReadOnly label="Member since" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : sessionUser?.createdAt ? new Date(sessionUser.createdAt).toLocaleDateString() : "—"} /><SaveButton disabled={!profile} /></form>}
          {section === "birth" && <div className="space-y-5"><Heading title="Birth Details" text="View the permanent details used by your spiritual calculations." /><div className="rounded-2xl border border-sky-300/15 bg-sky-400/[.06] p-4"><div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-200">🔒</span><div><h3 className="font-medium text-sky-100">Birth details are locked</h3><p className="mt-1 text-sm leading-6 text-white/50">These details are used for your Astrology and Numerology calculations and cannot be changed from Settings.</p><p className="mt-1 text-xs text-white/35">Contact support if an important correction is required.</p></div></div></div>{profileError && !hasLoadedProfile && <SectionError message="Your birth details could not be loaded." onRetry={() => void loadProfile()} />}{profileColdLoading ? <SettingsRowsSkeleton count={4} /> : profile?.birthDetails ? <div className="grid gap-3 sm:grid-cols-2"><LockedRow label="Full name used for calculations" value={profile.birthDetails.fullName || "Not available"} wide /><LockedRow label="Date of birth" value={formatBirthDate(profile.birthDetails.dateOfBirth)} /><LockedRow label="Birth time" value={profile.birthDetails.birthTimeKnown ? formatBirthTime(profile.birthDetails.birthTime) : "Unknown"} /><LockedRow label="Birth time accuracy" value={profile.birthDetails.birthTimeKnown ? "Exact birth time provided" : "Exact birth time is unknown"} /><LockedRow label="Birth place" value={profile.birthDetails.birthPlace || "Not available"} wide /></div> : <p className="rounded-xl border border-white/10 p-4 text-sm text-white/50">No birth profile has been saved yet. Complete the initial Birth Profile flow first.</p>}</div>}
          {section === "preferences" && <div className="space-y-6"><Heading title="Preferences" text="Saved privately to your Bhagya account and restored on every device." />{preferencesUnavailable && <SectionError message="Your preferences could not be loaded." onRetry={() => void refreshPreferences()} isRetrying={preferencesLoading} />}{preferencesUnavailable && <p className="rounded-xl border border-amber-300/15 bg-amber-300/[.06] px-3 py-2 text-sm text-amber-100/70">Showing safe defaults. Saving is disabled until your account preferences load.</p>}{preferencesColdLoading && !preferencesUnavailable ? <SettingsRowsSkeleton count={4} /> : <><Select disabled={preferencesUnavailable} label="Language" value={preferences.language} onChange={(value) => void setPreference({ language: value as BhagyaLanguage })} options={[["en", "English"], ["hi", "Hindi"]]} /><Select disabled={preferencesUnavailable} label="Default service" value={preferences.defaultService} onChange={(value) => void setPreference({ defaultService: value as BhagyaService })} options={[["astrology", "Astrology"], ["numerology", "Numerology"], ["tarot", "Tarot"], ["palmistry", "Palmistry"]]} /><Select disabled={preferencesUnavailable} label="Preferred response detail" value={preferences.responseDetail} onChange={(value) => void setPreference({ responseDetail: value as ResponseDetail })} options={[["concise", "Concise"], ["balanced", "Balanced"], ["detailed", "Detailed"]]} /><Field disabled={preferencesUnavailable} label="Timezone" value={timezoneDraft} onChange={setTimezoneDraft} placeholder="Asia/Kolkata" list="timezones" /><datalist id="timezones"><option value="Asia/Kolkata"/><option value="UTC"/><option value="America/New_York"/><option value="Europe/London"/></datalist><div className="flex flex-wrap gap-4"><button disabled={preferencesUnavailable} type="button" onClick={() => { const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; setTimezoneDraft(timezone); void setPreference({ timezone }); }} className="text-sm text-sky-300 disabled:opacity-40">Use this device’s timezone</button><button disabled={preferencesUnavailable} type="button" onClick={() => void setPreference({ timezone: timezoneDraft || null })} className="text-sm font-medium text-sky-200 disabled:opacity-40">Save timezone</button></div></>}</div>}
          {section === "privacy" && <div className="space-y-6"><Heading title="Privacy" text="Control how stored conversations are used without deleting your history." />{preferencesError && !hasLoadedPreferences && <SectionError message="Your preferences could not be loaded." onRetry={() => void refreshPreferences()} />}{preferencesColdLoading ? <SettingsRowsSkeleton count={1} /> : <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-4"><span><span className="block font-medium">Conversation Personalization</span><span className="mt-1 block text-sm leading-6 text-white/45">When enabled, Bhagya may use relevant earlier messages from the same service to keep the conversation connected.</span></span><input type="checkbox" checked={preferences.useChatPersonalization} onChange={(e) => void setPreference({ useChatPersonalization: e.target.checked })} className="mt-1 h-5 w-5" /></label>}<div><h3 className="font-medium">Stored Data Summary</h3><p className="mt-2 text-sm leading-7 text-white/50">Your account may contain a birth profile, chats and messages, Palmistry images, Tarot readings, and a Numerology profile. Turning personalization off does not delete them.</p></div><p className="rounded-xl border border-white/10 p-3 text-sm text-white/45">Individual chats remain managed from your conversation history. No destructive control is shown here because the app does not yet have a verified chat-deletion endpoint.</p></div>}
          {section === "account" && <div className="space-y-6"><Heading title="Account" text="Your authenticated account details." /><ReadOnly label="Email" value={displayEmail || "—"} /><button onClick={() => void signOut()} disabled={!isAuthenticated} className="min-h-12 rounded-xl bg-white/10 px-5 font-medium hover:bg-white/15 disabled:opacity-40">Sign Out</button><div className="rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4"><h3 className="font-medium text-rose-200">Delete Account</h3><p className="mt-2 text-sm leading-6 text-white/45">Account deletion is unavailable until a server-side Supabase admin function and verified Storage cleanup are configured. Your data will not be placed at risk by an incomplete action.</p></div></div>}
        </section>
      </div>
    </div>
  </main>;
}

function Heading({ title, text }: { title: string; text: string }) { return <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-white/45">{text}</p></div>; }
function Field({ label, value, onChange, type = "text", ...props }: { label: string; value: string; onChange: (value: string) => void; type?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) { return <label className="block text-sm text-white/65">{label}<input {...props} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#020817]/70 px-3 text-base text-white outline-none focus:border-sky-400/50 disabled:opacity-40" /></label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><p className="text-xs uppercase tracking-wider text-white/35">{label}</p><p className="mt-1 break-all text-sm text-white/70">{value}</p></div>; }
function LockedRow({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={`min-w-0 rounded-2xl border border-white/[.08] bg-white/[.025] p-4 ${wide ? "sm:col-span-2" : ""}`}><p className="text-xs font-medium uppercase tracking-[.12em] text-white/35">{label}</p><p className="mt-2 break-words text-[15px] leading-6 text-white/80">{value}</p></div>; }
function formatBirthDate(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Not available"; const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))); }
function formatBirthTime(value: string) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value || "Not available"; const [hour, minute] = value.split(":").map(Number); return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour, minute))); }
function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; disabled?: boolean }) { return <label className="block text-sm text-white/65">{label}<select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#020817] px-3 text-base text-white disabled:opacity-40">{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>; }
function SectionError({ message, onRetry, isRetrying = false }: { message: string; onRetry: () => void; isRetrying?: boolean }) { return <div className="rounded-xl border border-rose-400/20 bg-rose-500/[.07] p-3 text-sm text-rose-100"><p>{message}</p><button type="button" onClick={onRetry} disabled={isRetrying} className="mt-2 font-medium text-sky-300 disabled:opacity-40">{isRetrying ? "Retrying…" : "Retry"}</button></div>; }
function SettingsRowsSkeleton({ count }: { count: number }) { return <div aria-label="Loading section" className="space-y-3">{Array.from({ length: count }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-xl border border-white/[.06] bg-white/[.035]" />)}</div>; }
function SaveButton({ disabled = false }: { disabled?: boolean }) { return <button type="submit" disabled={disabled} className="min-h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 font-semibold shadow-lg shadow-sky-900/30 disabled:cursor-not-allowed disabled:opacity-40">Save Changes</button>; }
