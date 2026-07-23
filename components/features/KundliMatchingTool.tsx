"use client";

import { useEffect, useState } from "react";
import { useSettingsProfile } from "@/components/providers/SettingsProfileProvider";
import type { SecondPersonInput } from "@/lib/horoscope/types";
import { authenticatedPost } from "./featureClient";
import SecondPersonFields, { emptySecondPerson } from "./SecondPersonFields";

function PersonCard({
  number,
  title,
  description,
  value,
  onChange,
  badge,
}: {
  number: 1 | 2;
  title: string;
  description: string;
  value: SecondPersonInput;
  onChange: (value: SecondPersonInput) => void;
  badge?: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#071225]/85 p-5 shadow-[0_22px_70px_rgba(2,8,23,0.35)] sm:p-6">
      <div className="mb-5 flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-300/25 bg-sky-400/10 text-sm font-semibold text-sky-200">
          {number}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {badge && (
              <span className="rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-2.5 py-1 text-[11px] font-medium text-sky-200/70">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-white/45">{description}</p>
        </div>
      </div>

      <SecondPersonFields
        idPrefix={`person-${number}`}
        value={value}
        onChange={onChange}
      />
    </section>
  );
}

export default function KundliMatchingTool() {
  const { profile, loadProfile } = useSettingsProfile();
  const [firstDraft, setFirstDraft] = useState<SecondPersonInput | null>(null);
  const [second, setSecond] = useState<SecondPersonInput>(emptySecondPerson);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const savedFirst: SecondPersonInput = profile?.birthDetails
    ? {
        fullName: profile.birthDetails.fullName || profile.fullName,
        dateOfBirth: profile.birthDetails.dateOfBirth,
        birthTime: profile.birthDetails.birthTime,
        birthTimeKnown: profile.birthDetails.birthTimeKnown,
        birthPlace: profile.birthDetails.birthPlace,
      }
    : {
        ...emptySecondPerson,
        fullName: profile?.fullName || "",
      };
  const first = firstDraft ?? savedFirst;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authenticatedPost("/api/kundli-matching", {
        firstPerson: first,
        secondPerson: second,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Kundli comparison could not be completed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <PersonCard
          number={1}
          title="Your details"
          description="We prefill these from your profile when available. You can edit anything for this comparison."
          badge={profile?.birthDetails ? "Prefilled from profile" : undefined}
          value={first}
          onChange={setFirstDraft}
        />
        <PersonCard
          number={2}
          title="Partner’s details"
          description="Enter the birth details of the person you want to compare with."
          value={second}
          onChange={setSecond}
        />
      </div>

      <div className="rounded-2xl border border-sky-300/10 bg-sky-300/[0.035] p-4 text-sm leading-6 text-white/50">
        <p className="font-medium text-white/75">Before you continue</p>
        <p className="mt-1">
          Details entered here are used only for this comparison. Editing your
          details on this page does not change your saved birth profile.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          disabled={loading}
          className="min-h-12 rounded-xl bg-gradient-to-r from-[#08b7f2] to-[#2563eb] px-6 font-semibold text-white shadow-[0_14px_36px_rgba(34,199,242,0.22)] transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Comparing both birth charts…" : "Compare both Kundlis"}
        </button>
        <p className="text-xs leading-5 text-white/35">
          Exact birth times provide a more precise comparison.
        </p>
      </div>
    </form>
  );
}
