"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

type BirthDetailsResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  complete?: boolean;
  profile?: {
    fullName?: string;
    firstName?: string;
  } | null;
  birthDetails?: {
    dateOfBirth?: string;
    birthTime?: string;
    birthTimeKnown?: boolean;
    birthPlace?: string;
  } | null;
};

type FieldErrors = {
  fullName?: string;
  dateOfBirth?: string;
  birthTime?: string;
  birthPlace?: string;
  form?: string;
};

const birthProfileErrorMessages: Record<string, string> = {
  AUTH_REQUIRED: "Your session has expired. Please sign in again.",
  INVALID_NAME: "Please enter your full name.",
  INVALID_DATE: "Please enter a valid date of birth.",
  INVALID_TIME:
    "Please enter a valid birth time or choose 'I don't know my exact birth time'.",
  LOCATION_NOT_FOUND:
    "We could not find that place. Please enter City, State, Country.",
  PROFILE_SAVE_FAILED:
    "We could not save your name right now. Please try again.",
  BIRTH_DETAILS_SAVE_FAILED:
    "We could not save your birth details right now. Please try again.",
  DATABASE_SCHEMA_MISMATCH:
    "Your birth profile database needs an update before saving.",
};

type OnboardingStep = "form" | "preparing" | "welcome";

function getMetadataName(metadata: Record<string, unknown> | undefined) {
  const fullName = metadata?.full_name;
  const name = metadata?.name;

  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  if (typeof name === "string" && name.trim()) return name.trim();

  return "";
}

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

function getBirthProfileErrorMessage(data: BirthDetailsResponse | null) {
  if (data?.code && birthProfileErrorMessages[data.code]) {
    return birthProfileErrorMessages[data.code];
  }

  return data?.message || "";
}

export default function BirthDetailsPage() {
  const router = useRouter();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enableButtonTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthTimeKnown, setBirthTimeKnown] = useState(true);
  const [birthPlace, setBirthPlace] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("form");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [welcomeFirstName, setWelcomeFirstName] = useState("there");
  const [canBeginReading, setCanBeginReading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadBirthDetails() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login?next=/birth-details");
        return;
      }

      if (isMounted) {
        setFullName(
          getMetadataName(
            session.user.user_metadata as Record<string, unknown> | undefined
          )
        );
      }

      try {
        const res = await fetch("/api/birth-details", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (res.status === 401) {
          router.replace("/login?next=/birth-details");
          return;
        }

        if (!res.ok) {
          throw new Error("Could not load birth details.");
        }

        const data = (await res.json()) as BirthDetailsResponse;

        if (data.profile?.fullName && isMounted) {
          setFullName(data.profile.fullName);
        }

        if (data.birthDetails && isMounted) {
          const known = data.birthDetails.birthTimeKnown !== false;

          setDateOfBirth(data.birthDetails.dateOfBirth || "");
          setBirthTime(data.birthDetails.birthTime || "");
          setBirthTimeKnown(known);
          setBirthPlace(data.birthDetails.birthPlace || "");
        }

        if (data.complete) {
          router.replace("/settings");
          return;
        }
      } catch {
        if (isMounted) {
          setErrors({
            form: "Could not load your birth profile. Please try again.",
          });
        }
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    }

    void loadBirthDetails();

    return () => {
      isMounted = false;
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      if (enableButtonTimeoutRef.current) {
        clearTimeout(enableButtonTimeoutRef.current);
      }
    };
  }, [router]);

  function validateForm() {
    const nextErrors: FieldErrors = {};

    if (fullName.trim().length < 2) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!dateOfBirth) {
      nextErrors.dateOfBirth = "Date of birth is required.";
    }

    if (birthTimeKnown && !birthTime) {
      nextErrors.birthTime = "Exact birth time is required, or choose unknown.";
    }

    if (birthPlace.trim().length < 2) {
      nextErrors.birthPlace = "Birth place is required.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  function beginReading() {
    router.replace("/");
  }

  async function showWelcome(token: string, firstName: string) {
    setStep("preparing");
    setCanBeginReading(false);

    let message = `${firstName}, your Bhagya profile is ready. Start with calm confidence today; your reading will be more personal from here.`;

    try {
      const res = await fetch("/api/onboarding-reading", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { message?: string };

      if (res.ok && data.message) {
        message = data.message;
      }
    } catch {
      // Keep onboarding moving even if the welcome reading cannot be generated.
    }

    setWelcomeFirstName(firstName);
    setWelcomeMessage(message);
    setStep("welcome");

    enableButtonTimeoutRef.current = setTimeout(() => {
      setCanBeginReading(true);
    }, 3000);
    redirectTimeoutRef.current = setTimeout(() => {
      router.replace("/");
    }, 6000);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateForm()) return;

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      router.replace("/login?next=/birth-details");
      return;
    }

    const token = session.access_token;

    setIsSaving(true);
    setErrors({});
    setSuggestions([]);

    try {
      const res = await fetch("/api/birth-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          dateOfBirth,
          birthTime: birthTimeKnown ? birthTime : null,
          birthTimeKnown,
          birthPlace: birthPlace.trim(),
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | (BirthDetailsResponse & {
            field?: keyof FieldErrors;
            suggestions?: string[];
          })
        | null;

      if (!res.ok) {
        console.error("Birth profile API error:", data);

        const message =
          getBirthProfileErrorMessage(data) ||
          `Could not save your profile. Error ${res.status}.`;

        if (data?.suggestions?.length) {
          setSuggestions(data.suggestions);
        }

        if (data?.field) {
          setErrors({ [data.field]: message });
        } else {
          setErrors({ form: message });
        }

        return;
      }

      await showWelcome(
        token,
        data?.profile?.firstName || getFirstName(fullName)
      );
    } catch {
      setErrors({
        form: "Could not save your birth profile. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#020817] text-white">
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden">
        <div
          className="absolute aspect-square rounded-full border border-sky-400/10"
          style={{
            width: "min(112vw, 820px)",
            animation: "spinCCW 280s linear infinite",
          }}
        />
        <div
          className="absolute aspect-square rounded-full bg-contain bg-center bg-no-repeat opacity-[0.14] mix-blend-screen"
          style={{
            width: "min(88vw, 680px)",
            backgroundImage: "url('/mandala.png')",
            animation: "spinCW 190s linear infinite",
            filter: "hue-rotate(185deg) saturate(1.6) brightness(1.15)",
          }}
        />
      </div>

      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 20%, rgba(2,8,23,0.82) 76%, rgba(0,0,0,0.92) 100%)",
        }}
      />

      <section className="relative z-10 flex min-h-[100svh] flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+18px)]">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-sky-500/20"
              style={{
                background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
              }}
            >
              <span className="text-base">*</span>
            </div>
            <div>
              <p className="text-[17px] font-semibold leading-none tracking-tight">
                Bhagya.ai
              </p>
              <p className="mt-0.5 text-[12px] leading-none text-sky-300/70">
                Birth Profile
              </p>
            </div>
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-[13px] font-medium text-sky-300/80 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
                Kundli setup
              </div>

              <h1 className="text-[34px] font-semibold leading-[1.12] tracking-[-0.03em] text-white/95">
                {step === "welcome"
                  ? `Welcome, ${welcomeFirstName}`
                  : "Complete your birth profile"}
              </h1>
              <p className="mx-auto mt-4 max-w-[340px] text-[15px] leading-6 text-white/52">
                {step === "welcome"
                  ? "Your profile is saved. Bhagya is ready to begin."
                  : "These details help Bhagya calculate your kundli and give personalised readings."}
              </p>
            </div>

            {step === "welcome" ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-2xl backdrop-blur-2xl">
                <p className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-4 text-[15px] leading-6 text-sky-50/90">
                  {welcomeMessage}
                </p>
                <button
                  type="button"
                  onClick={beginReading}
                  disabled={!canBeginReading}
                  className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-2xl px-5 text-[15px] font-semibold text-white shadow-lg shadow-sky-500/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
                  style={{
                    background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                  }}
                >
                  Begin my reading
                </button>
                <p className="mt-3 text-xs leading-5 text-white/35">
                  Bhagya will open automatically in a moment.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-2xl sm:p-5"
              >
                {isChecking || step === "preparing" ? (
                  <div className="py-12 text-center text-[15px] text-white/55">
                    {step === "preparing"
                      ? "Preparing your first Bhagya reading..."
                      : "Preparing your Bhagya profile..."}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/38">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        placeholder="Enter your full name"
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                      />
                      {errors.fullName && (
                        <p className="mt-2 text-sm text-rose-200">
                          {errors.fullName}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/38">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(event) => setDateOfBirth(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                      />
                      {errors.dateOfBirth && (
                        <p className="mt-2 text-sm text-rose-200">
                          {errors.dateOfBirth}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/38">
                        Exact Birth Time
                      </label>
                      <input
                        type="time"
                        value={birthTime}
                        disabled={!birthTimeKnown}
                        onChange={(event) => setBirthTime(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30 disabled:opacity-45"
                      />
                      <label className="mt-3 flex min-h-[48px] items-center gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/72">
                        <input
                          type="checkbox"
                          checked={!birthTimeKnown}
                          onChange={(event) => {
                            const known = !event.target.checked;

                            setBirthTimeKnown(known);
                            if (!known) setBirthTime("");
                          }}
                          className="h-4 w-4 accent-sky-400"
                        />
                        I don&apos;t know my exact birth time
                      </label>
                      <p className="mt-2 text-xs leading-5 text-white/35">
                        If unknown, Bhagya will use a broad noon fallback and avoid precise Lagna or house claims.
                      </p>
                      {errors.birthTime && (
                        <p className="mt-2 text-sm text-rose-200">
                          {errors.birthTime}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/38">
                        Birth Place
                      </label>
                      <input
                        type="text"
                        value={birthPlace}
                        onChange={(event) => {
                          setBirthPlace(event.target.value);
                          setSuggestions([]);
                        }}
                        placeholder="City, State, Country"
                        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                      />
                      <p className="mt-2 text-xs leading-5 text-white/35">
                        Example: Agartala, Tripura, India
                      </p>
                      {errors.birthPlace && (
                        <p className="mt-2 text-sm text-rose-200">
                          {errors.birthPlace}
                        </p>
                      )}
                      {suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {suggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => {
                                setBirthPlace(suggestion);
                                setSuggestions([]);
                              }}
                              className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100/80"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {errors.form && (
                      <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                        {errors.form}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex min-h-[52px] w-full items-center justify-center rounded-2xl px-5 text-[15px] font-semibold text-white shadow-lg shadow-sky-500/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-65"
                      style={{
                        background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                      }}
                    >
                      {isSaving ? "Saving your profile..." : "Continue to Bhagya"}
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </section>

      <style>{`
        @keyframes spinCW {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        @keyframes spinCCW {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
      `}</style>
    </main>
  );
}
