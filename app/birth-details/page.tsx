"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

type BirthDetailsResponse = {
  complete?: boolean;
  birthDetails?: {
    dateOfBirth?: string;
    birthTime?: string;
    birthPlace?: string;
  } | null;
};

type FieldErrors = {
  dateOfBirth?: string;
  birthTime?: string;
  birthPlace?: string;
  form?: string;
};

export default function BirthDetailsPage() {
  const router = useRouter();
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadBirthDetails() {
      const editMode =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("edit") === "1";

      if (isMounted) {
        setIsEditMode(editMode);
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login?next=/birth-details");
        return;
      }

      if (isMounted) {
        setAccessToken(session.access_token);
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

        if (data.birthDetails && isMounted) {
          setDateOfBirth(data.birthDetails.dateOfBirth || "");
          setBirthTime(data.birthDetails.birthTime || "");
          setBirthPlace(data.birthDetails.birthPlace || "");
        }

        if (data.complete && !editMode) {
          router.replace("/");
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
    };
  }, [router]);

  function validateForm() {
    const nextErrors: FieldErrors = {};

    if (!dateOfBirth) {
      nextErrors.dateOfBirth = "Date of birth is required.";
    }

    if (!birthTime) {
      nextErrors.birthTime = "Exact birth time is required.";
    }

    if (birthPlace.trim().length < 2) {
      nextErrors.birthPlace = "Birth place is required.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateForm()) return;

    const token = accessToken || (await supabase.auth.getSession()).data.session?.access_token;

    if (!token) {
      router.replace("/login?next=/birth-details");
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      const res = await fetch("/api/birth-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dateOfBirth,
          birthTime,
          birthPlace,
        }),
      });

      const data = (await res.json()) as {
        message?: string;
        field?: keyof FieldErrors;
      };

      if (!res.ok) {
        const message =
          data.message || "Could not save your birth details. Please try again.";

        if (data.field) {
          setErrors({ [data.field]: message });
        } else {
          setErrors({ form: message });
        }

        return;
      }

      router.replace("/");
    } catch {
      setErrors({
        form: "Could not save your birth details. Please try again.",
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
                Complete your birth profile
              </h1>
              <p className="mx-auto mt-4 max-w-[340px] text-[15px] leading-6 text-white/52">
                These details help Bhagya calculate your kundli and give personalised readings.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl backdrop-blur-2xl sm:p-5"
            >
              {isChecking ? (
                <div className="py-12 text-center text-[15px] text-white/55">
                  Preparing your Bhagya profile...
                </div>
              ) : (
                <div className="space-y-4">
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
                      onChange={(event) => setBirthTime(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                    />
                    <p className="mt-2 text-xs leading-5 text-white/35">
                      Please enter the time shown on your birth record, if available.
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
                      onChange={(event) => setBirthPlace(event.target.value)}
                      placeholder="City, State, Country"
                      className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-[16px] text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                    />
                    <p className="mt-2 text-xs leading-5 text-white/35">
                      Example: Nainital, Uttarakhand, India
                    </p>
                    {errors.birthPlace && (
                      <p className="mt-2 text-sm text-rose-200">
                        {errors.birthPlace}
                      </p>
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
                    {isSaving
                      ? "Preparing your kundli..."
                      : isEditMode
                      ? "Update birth details"
                      : "Continue to Bhagya"}
                  </button>
                </div>
              )}
            </form>
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
