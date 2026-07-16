"use client";

import { useState } from "react";
import type {
  NumerologyBlueprintNumber,
  NumerologyBlueprintPayload,
} from "@/lib/numerology/types";

const summaryNumbers: Array<{
  key: keyof NumerologyBlueprintPayload["numbers"];
  label: string;
}> = [
  { key: "lifePath", label: "Life Path" },
  { key: "expression", label: "Expression" },
  { key: "soulUrge", label: "Soul Urge" },
  { key: "personality", label: "Personality" },
  { key: "birthday", label: "Birthday" },
  { key: "personalYear", label: "Personal Year" },
];

const detailNumbers: Array<{
  key: keyof NumerologyBlueprintPayload["numbers"];
  label: string;
}> = [
  ...summaryNumbers,
  { key: "attitude", label: "Attitude" },
  { key: "maturity", label: "Maturity" },
  { key: "personalMonth", label: "Personal Month" },
  { key: "personalDay", label: "Personal Day" },
];

const quickPrompts = [
  "What does my Life Path mean?",
  "Career",
  "Love",
  "Money",
  "My strengths",
  "My challenges",
  "What is this year teaching me?",
  "Show my calculations",
];

function NumberMark({ value }: { value: number }) {
  return (
    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/[0.08] text-lg font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.09)]">
      {value}
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: NumerologyBlueprintNumber;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-white/[0.07] py-3 last:border-b-0 sm:border-b-0 sm:py-2.5">
      <NumberMark value={value.number} />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-200/55">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-5 text-white/92">
          {value.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-white/52">
          {value.essence}
        </p>
      </div>
    </div>
  );
}

export default function NumerologyBlueprint({
  profile,
  onPromptSelect,
}: {
  profile: NumerologyBlueprintPayload;
  onPromptSelect: (prompt: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const lifePath = profile.numbers.lifePath;

  return (
    <section className="w-[min(650px,calc(100vw-70px))] max-w-full overflow-hidden rounded-[24px] border border-cyan-200/15 bg-[#06101f]/92 shadow-[0_24px_72px_rgba(2,8,23,0.58),0_0_40px_rgba(34,211,238,0.06)] backdrop-blur-2xl">
      <div className="border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/58">
          Pythagorean Numerology
        </p>
        <h3 className="mt-1 text-[19px] font-semibold leading-7 text-white">
          Your Number Blueprint
        </h3>
        <p className="mt-1 text-[12px] leading-5 text-white/45">
          {profile.displayFirstName ? `${profile.displayFirstName}, this map` : "This map"} was calculated from your saved birth profile. Personal cycles are current for {profile.calculatedForDate}.
        </p>
      </div>

      <div className="px-4 py-3 sm:px-5 sm:py-4">
        <div className="grid sm:grid-cols-2 sm:gap-x-5">
          {summaryNumbers.map(({ key, label }) => (
            <SummaryItem key={key} label={label} value={profile.numbers[key]} />
          ))}
        </div>

        <div className="mt-3 border-t border-white/[0.07] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/42">
            Blueprint insight
          </p>
          <p className="mt-2 text-[13px] leading-6 text-white/72">
            {lifePath.essence} {lifePath.growthLesson} This is a reflective map, not a fixed prediction.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((current) => !current)}
          aria-expanded={showDetails}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-white/68 transition hover:border-cyan-200/25 hover:bg-cyan-200/[0.06] hover:text-cyan-50"
        >
          <span aria-hidden="true" className="text-base leading-none text-cyan-200/70">
            {showDetails ? "-" : "+"}
          </span>
          {showDetails ? "Hide calculation details" : "View calculation details"}
        </button>

        {showDetails && (
          <div className="mt-4 space-y-3 border-t border-white/[0.07] pt-4">
            {detailNumbers.map(({ key, label }) => {
              const value = profile.numbers[key];
              return (
                <div key={key} className="border-b border-white/[0.06] pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12px] font-semibold text-white/82">{label}</p>
                    <span className="text-sm font-semibold text-cyan-100">{value.number}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-white/48">
                    Strengths: {value.strengths.join(", ")}. Watch for {value.challenges.join(", ")}.
                  </p>
                  <div className="mt-2 space-y-1 rounded-lg bg-black/20 px-3 py-2 font-mono text-[10px] leading-4 text-cyan-50/55 [overflow-wrap:anywhere]">
                    {value.steps.map((step) => <p key={step}>{step}</p>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">
            Explore your blueprint
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onPromptSelect(prompt)}
                className="min-h-9 rounded-full border border-cyan-100/12 bg-cyan-200/[0.045] px-3 text-left text-[11px] font-medium leading-4 text-cyan-50/68 transition hover:border-cyan-100/28 hover:bg-cyan-200/[0.09] hover:text-cyan-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
