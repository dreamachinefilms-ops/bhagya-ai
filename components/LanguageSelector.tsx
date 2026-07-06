"use client";

import { useState } from "react";
import { languages, type LanguageCode } from "@/lib/languages";

export default function LanguageSelector({
  selectedLanguage,
  setSelectedLanguage,
}: {
  selectedLanguage: LanguageCode;
  setSelectedLanguage: (language: LanguageCode) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const currentLanguage =
    languages.find((lang) => lang.code === selectedLanguage) || languages[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-white/70 backdrop-blur-md transition hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-300"
        aria-label={currentLanguage.label}
        aria-expanded={isOpen}
      >
        <span>🌐</span>
        <span>{currentLanguage.short}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl border border-white/10 bg-[#020817]/95 p-1.5 shadow-2xl backdrop-blur-2xl">
          {languages.map((language) => {
            const active = selectedLanguage === language.code;

            return (
              <button
                key={language.code}
                type="button"
                onClick={() => {
                  setSelectedLanguage(language.code);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition ${
                  active
                    ? "bg-sky-500/15 text-sky-300"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span>{language.label}</span>
                <span className="text-[10px] text-white/35">
                  {language.short}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
