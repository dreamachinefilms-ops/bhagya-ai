"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";

export type BirthDetails = {
  fullName: string;
  dateOfBirth: string;
  birthTime: string;
  birthTimeKnown: boolean;
  birthPlace: string;
};

export type ProfileData = {
  fullName: string;
  firstName: string;
  email: string;
  createdAt: string;
  birthDetails: BirthDetails | null;
};

type SessionUser = { id: string; email: string; fullName: string; createdAt: string };
type LoadStatus = "idle" | "loading" | "success" | "error";

type SettingsProfileContextValue = {
  profile: ProfileData | null;
  sessionUser: SessionUser | null;
  status: LoadStatus;
  hasLoaded: boolean;
  error: string | null;
  loadProfile: () => Promise<void>;
  updateCachedProfile: (profile: ProfileData) => void;
  clearProfile: () => void;
};

const SettingsProfileContext = createContext<SettingsProfileContextValue | null>(null);

export function SettingsProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  const requestInFlightRef = useRef<Promise<void> | null>(null);

  const clearProfile = useCallback(() => {
    currentUserIdRef.current = null;
    hasLoadedRef.current = false;
    requestInFlightRef.current = null;
    setProfile(null);
    setSessionUser(null);
    setStatus("idle");
    setHasLoaded(false);
    setError(null);
  }, []);

  const loadProfile = useCallback(async () => {
    if (requestInFlightRef.current) return requestInFlightRef.current;
    const request = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        clearProfile();
        setStatus("error");
        setError("Your session has expired. Please sign in again.");
        return;
      }

      const userId = session.user.id;
      if (currentUserIdRef.current && currentUserIdRef.current !== userId) clearProfile();
      currentUserIdRef.current = userId;
      setSessionUser({
        id: userId,
        email: session.user.email || "",
        fullName: typeof session.user.user_metadata?.full_name === "string" ? session.user.user_metadata.full_name : "",
        createdAt: session.user.created_at,
      });
      if (!hasLoadedRef.current) setStatus("loading");
      setError(null);

      try {
        const response = await fetch("/api/profile", {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        });
        const data = await response.json() as { profile?: ProfileData; message?: string };
        if (!response.ok || !data.profile) throw new Error(data.message || "PROFILE_LOAD_FAILED");
        setProfile(data.profile);
        hasLoadedRef.current = true;
        setHasLoaded(true);
        setStatus("success");
      } catch {
        setStatus(hasLoadedRef.current ? "success" : "error");
        setError("Your profile could not be loaded. Please try again.");
      }
    })();
    requestInFlightRef.current = request;
    try { await request; }
    finally { if (requestInFlightRef.current === request) requestInFlightRef.current = null; }
  }, [clearProfile]);

  const updateCachedProfile = useCallback((nextProfile: ProfileData) => {
    setProfile(nextProfile);
    hasLoadedRef.current = true;
    setHasLoaded(true);
    setStatus("success");
    setError(null);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearProfile();
    });
    return () => subscription.unsubscribe();
  }, [clearProfile]);

  const value = useMemo(() => ({ profile, sessionUser, status, hasLoaded, error, loadProfile, updateCachedProfile, clearProfile }), [profile, sessionUser, status, hasLoaded, error, loadProfile, updateCachedProfile, clearProfile]);
  return <SettingsProfileContext.Provider value={value}>{children}</SettingsProfileContext.Provider>;
}

export function useSettingsProfile() {
  const value = useContext(SettingsProfileContext);
  if (!value) throw new Error("useSettingsProfile must be used inside SettingsProfileProvider");
  return value;
}
