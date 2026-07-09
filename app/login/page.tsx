"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import LanguageSelector from "@/components/LanguageSelector";
import {
  DEFAULT_LANGUAGE_CODE,
  LANGUAGE_DEFAULT_MIGRATION_KEY,
  LANGUAGE_STORAGE_KEY,
  languages,
  UI_TEXT,
  type LanguageCode,
} from "@/lib/languages";
import { supabase } from "@/lib/supabaseClient";

type AuthMode = "login" | "signup";

function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === "string" &&
    languages.some((language) => language.code === value)
  );
}

function getNextUrl() {
  if (typeof window === "undefined") return "/";

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next") || "/";

  // Safety: only allow internal app redirects
  return next.startsWith("/") ? next : "/";
}

export default function LoginPage() {
  const router = useRouter();

  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguageCode>(DEFAULT_LANGUAGE_CODE);
  const [hasLoadedLanguage, setHasLoadedLanguage] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignup = mode === "signup";
  const t = UI_TEXT[selectedLanguage];

  useEffect(() => {
    const migrated = localStorage.getItem(LANGUAGE_DEFAULT_MIGRATION_KEY);
    let savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (!migrated) {
      if (!savedLanguage || savedLanguage === "hinglish") {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE_CODE);
        savedLanguage = DEFAULT_LANGUAGE_CODE;
      }

      localStorage.setItem(LANGUAGE_DEFAULT_MIGRATION_KEY, "true");
    }

    if (isLanguageCode(savedLanguage)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the persisted client preference after mount
      setSelectedLanguage(savedLanguage);
    } else {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE_CODE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default to English when no persisted preference exists
      setSelectedLanguage(DEFAULT_LANGUAGE_CODE);
    }

    setHasLoadedLanguage(true);
  }, []);

  useEffect(() => {
    if (hasLoadedLanguage) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    }
  }, [hasLoadedLanguage, selectedLanguage]);

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();

  if (!email.trim() || !password.trim()) {
    setMessage(t.pleaseEnterEmailPassword);
    return;
  }

  if (isSignup && !name.trim()) {
    setMessage(t.pleaseEnterName);
    return;
  }

  setIsSubmitting(true);
  setMessage("");

  try {
    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          data: {
            full_name: name.trim(),
          },
        },
      });

      if (error) {
        const errorMessage = error.message.toLowerCase();

        if (
          errorMessage.includes("already registered") ||
          errorMessage.includes("already exists") ||
          errorMessage.includes("user already")
        ) {
          setMessage(
            t.accountExists
          );
          setMode("login");
          return;
        }

        setMessage(error.message);
        return;
      }

      // Supabase may return a fake/obfuscated user for an existing email
      // when email confirmation is enabled.
      const identities = data.user?.identities;

      if (data.user && Array.isArray(identities) && identities.length === 0) {
        setMessage(
          t.accountExists
        );
        setMode("login");
        return;
      }

      if (data.session) {
        setMessage(t.accountCreated);

        setTimeout(() => {
          router.push(getNextUrl());
        }, 500);
      } else {
        setMessage(
          t.confirmEmail
        );
        setMode("login");
      }

      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(t.loginSuccess);

    setTimeout(() => {
      router.push(getNextUrl());
    }, 500);
  } catch {
    setMessage(t.authError);
  } finally {
    setIsSubmitting(false);
  }
}
  async function handleGoogleLogin() {
    setIsSubmitting(true);
    setMessage("");

    const nextUrl = getNextUrl();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}${nextUrl}`
            : undefined,
      },
    });

    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020817] text-white">
      {/* Background zodiac / mandala */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
        <div
          className="absolute h-[900px] w-[900px] rounded-full border border-[#38bdf8]/10"
          style={{ animation: "spinCCW 280s linear infinite" }}
        />

        <div
          className="absolute h-[680px] w-[680px] rounded-full border border-[#38bdf8]/10"
          style={{ animation: "spinCW 210s linear infinite" }}
        />

        <div
          className="h-[760px] w-[760px] rounded-full bg-contain bg-center bg-no-repeat opacity-[0.18]"
          style={{
            backgroundImage: "url('/mandala.png')",
            animation: "spinCW 190s linear infinite",
            filter: "hue-rotate(185deg) saturate(1.8) brightness(1.15)",
          }}
        />

        <div
          className="absolute h-[520px] w-[520px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(2,8,23,0.18) 0%, rgba(2,8,23,0.88) 75%, rgba(0,0,0,0.95) 100%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex w-full items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-2xl shadow-lg shadow-sky-500/20 transition group-hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
            }}
          >
            <span className="text-base">✨</span>
          </div>

          <div>
            <p className="text-[15px] font-semibold leading-none tracking-tight">
              {t.appName}
            </p>
            <p className="mt-0.5 text-[11px] leading-none text-sky-300/70">
              {t.tagline}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <LanguageSelector
            selectedLanguage={selectedLanguage}
            setSelectedLanguage={setSelectedLanguage}
          />

          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/70 backdrop-blur-md transition hover:border-sky-400/40 hover:text-sky-300"
          >
            {t.back}
          </Link>
        </div>
      </header>

      {/* Main Auth Card */}
      <section className="relative z-10 flex min-h-[calc(100vh-80px)] items-center justify-center px-5 pb-12">
        <div className="w-full max-w-md">
          <div className="mb-7 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-1.5 text-xs font-medium text-sky-300/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
              {t.authBadge}
            </div>

            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {isSignup ? t.createAccount : t.welcomeBack}
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-white/45">
              {isSignup ? t.signupDescription : t.loginDescription}
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl backdrop-blur-2xl md:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/35">
                    {t.fullName}
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t.enterName}
                    className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-white/35">
                  {t.email}
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-medium uppercase tracking-[0.16em] text-white/35">
                    {t.password}
                  </label>

                  {!isSignup && (
                    <button
                      type="button"
                      className="text-xs text-sky-300/70 transition hover:text-sky-200"
                    >
                      {t.forgot}
                    </button>
                  )}
                </div>

                <div className="flex items-center rounded-2xl border border-white/10 bg-black/25 px-4 transition focus-within:border-sky-400/50 focus-within:ring-1 focus:ring-sky-400/30">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t.enterPassword}
                    className="flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-white/25"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-xs text-white/40 transition hover:text-sky-300"
                  >
                    {showPassword ? t.hide : t.show}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                }}
              >
                {isSubmitting
                  ? t.pleaseWait
                  : isSignup
                  ? t.createAccountButton
                  : t.login}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">{t.or}</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm font-medium text-white/70 transition hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-base">G</span>
              {t.continueWithGoogle}
            </button>

            {message && (
              <p className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-center text-sm text-sky-100/85">
                {message}
              </p>
            )}

            <p className="mt-5 text-center text-xs leading-relaxed text-white/35">
              {t.termsText}
            </p>
          </div>

          <p className="mt-5 text-center text-sm text-white/45">
            {isSignup ? t.alreadyHaveAccount : t.newToBhagya}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? "login" : "signup");
                setMessage("");
              }}
              className="font-medium text-sky-300 transition hover:text-sky-200"
            >
              {isSignup ? t.login : t.createAccountButton}
            </button>
          </p>
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
