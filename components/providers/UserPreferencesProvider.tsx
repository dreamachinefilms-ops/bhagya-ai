"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from "@/lib/userPreferences";

type UserPreferencesContextValue = {
  preferences: UserPreferences;
  isLoading: boolean;
  hasLoaded: boolean;
  isSaving: boolean;
  error: string | null;
  isAuthenticated: boolean;
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  refreshPreferences: () => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | null>(null);

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } : null;
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_USER_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const hasLoadedRef = useRef(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refreshPreferences = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const refresh = (async () => {
      const headers = await authHeaders();
      if (!headers) { setIsAuthenticated(false); setIsLoading(false); return; }
      setIsAuthenticated(true);
      if (!hasLoadedRef.current) setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/settings", { headers });
        const data = await response.json() as { preferences?: UserPreferences; message?: string };
        if (!response.ok || !data.preferences) throw new Error(data.message);
        setPreferences(data.preferences);
        hasLoadedRef.current = true;
        setHasLoaded(true);
      } catch { setError("Your preferences could not be loaded. Please try again."); }
      finally { setIsLoading(false); }
    })();
    refreshInFlightRef.current = refresh;
    try { await refresh; }
    finally { if (refreshInFlightRef.current === refresh) refreshInFlightRef.current = null; }
  }, []);

  useEffect(() => {
    void refreshPreferences();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { hasLoadedRef.current = false; setHasLoaded(false); setIsAuthenticated(false); setPreferences(DEFAULT_USER_PREFERENCES); setIsLoading(false); }
      else if (event !== "INITIAL_SESSION") void refreshPreferences();
    });
    return () => subscription.unsubscribe();
  }, [refreshPreferences]);

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const previous = preferences;
    setPreferences((current) => ({ ...current, ...patch })); setIsSaving(true); setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) throw new Error("UNAUTHORIZED");
      const response = await fetch("/api/settings", { method: "PATCH", headers, body: JSON.stringify(patch) });
      const data = await response.json() as { preferences?: UserPreferences };
      if (!response.ok || !data.preferences) throw new Error("SAVE_FAILED");
      setPreferences(data.preferences);
    } catch (cause) { setPreferences(previous); setError(cause instanceof Error && cause.message === "UNAUTHORIZED" ? "Your session has expired. Please sign in again." : "Your settings could not be saved. Please try again."); throw cause; }
    finally { setIsSaving(false); }
  }, [preferences]);

  const value = useMemo(() => ({ preferences, isLoading, hasLoaded, isSaving, error, isAuthenticated, updatePreferences, refreshPreferences }), [preferences, isLoading, hasLoaded, isSaving, error, isAuthenticated, updatePreferences, refreshPreferences]);
  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  const value = useContext(UserPreferencesContext);
  if (!value) throw new Error("useUserPreferences must be used inside UserPreferencesProvider");
  return value;
}
