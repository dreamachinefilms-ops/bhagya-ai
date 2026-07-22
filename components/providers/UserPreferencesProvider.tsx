"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
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
let cachedPreferencesForUser: { userId: string; preferences: UserPreferences } | null = null;
const activePreferencesRequests = new Map<string, Promise<UserPreferences>>();
let preferencesCacheGeneration = 0;

function clearPreferencesCache() {
  cachedPreferencesForUser = null;
  preferencesCacheGeneration += 1;
}

async function fetchPreferencesOnce(userId: string, accessToken: string, force = false) {
  if (!force && cachedPreferencesForUser?.userId === userId) return cachedPreferencesForUser.preferences;
  const activeRequest = activePreferencesRequests.get(userId);
  if (activeRequest) return activeRequest;
  const requestGeneration = preferencesCacheGeneration;
  const request = (async () => {
    const response = await fetch("/api/settings", { headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` } });
    const data = await response.json() as { preferences?: UserPreferences; message?: string };
    if (!response.ok || !data.preferences) throw new Error(data.message || "Your preferences could not be loaded.");
    if (preferencesCacheGeneration === requestGeneration) cachedPreferencesForUser = { userId, preferences: data.preferences };
    return data.preferences;
  })().catch((cause) => {
    if (process.env.NODE_ENV !== "production") console.error("[UserPreferencesProvider] Preferences request failed", cause instanceof Error ? cause.message : "Unknown error");
    throw cause;
  });
  activePreferencesRequests.set(userId, request);
  try { return await request; }
  finally { if (activePreferencesRequests.get(userId) === request) activePreferencesRequests.delete(userId); }
}

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_USER_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);
  const attemptedUserIdRef = useRef<string | null>(null);

  const resetPreferences = useCallback(() => {
    clearPreferencesCache();
    currentUserIdRef.current = null;
    attemptedUserIdRef.current = null;
    setPreferences(DEFAULT_USER_PREFERENCES);
    setHasLoaded(false);
    setIsAuthenticated(false);
    setIsLoading(false);
    setError(null);
  }, []);

  const loadForSession = useCallback(async (session: Session | null, force = false) => {
    if (!session) { resetPreferences(); return; }
    const userId = session.user.id;
    if (currentUserIdRef.current && currentUserIdRef.current !== userId) {
      clearPreferencesCache();
      attemptedUserIdRef.current = null;
      setPreferences(DEFAULT_USER_PREFERENCES);
      setHasLoaded(false);
    }
    currentUserIdRef.current = userId;
    setIsAuthenticated(true);

    const cached = cachedPreferencesForUser?.userId === userId ? cachedPreferencesForUser.preferences : null;
    if (cached && !force) {
      attemptedUserIdRef.current = userId;
      setPreferences(cached);
      setHasLoaded(true);
      setIsLoading(false);
      setError(null);
      return;
    }
    if (!force && attemptedUserIdRef.current === userId) return;
    attemptedUserIdRef.current = userId;
    if (!cached) setIsLoading(true);
    setError(null);
    try {
      const loaded = await fetchPreferencesOnce(userId, session.access_token, force);
      if (currentUserIdRef.current !== userId) return;
      setPreferences(loaded);
      setHasLoaded(true);
    } catch {
      if (currentUserIdRef.current === userId) setError("Your preferences could not be loaded. Please try again.");
    } finally {
      if (currentUserIdRef.current === userId) setIsLoading(false);
    }
  }, [resetPreferences]);

  const refreshPreferences = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    await loadForSession(session, true);
  }, [loadForSession]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => loadForSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") resetPreferences();
      else void loadForSession(session);
    });
    return () => subscription.unsubscribe();
  }, [loadForSession, resetPreferences]);

  const updatePreferences = useCallback(async (patch: Partial<UserPreferences>) => {
    const previous = preferences;
    const optimistic = { ...preferences, ...patch };
    setPreferences(optimistic);
    if (currentUserIdRef.current) cachedPreferencesForUser = { userId: currentUserIdRef.current, preferences: optimistic };
    setIsSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("UNAUTHORIZED");
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(patch) });
      const data = await response.json() as { preferences?: UserPreferences };
      if (!response.ok || !data.preferences) throw new Error("SAVE_FAILED");
      setPreferences(data.preferences);
      cachedPreferencesForUser = { userId: session.user.id, preferences: data.preferences };
    } catch (cause) {
      setPreferences(previous);
      if (currentUserIdRef.current) cachedPreferencesForUser = { userId: currentUserIdRef.current, preferences: previous };
      setError(cause instanceof Error && cause.message === "UNAUTHORIZED" ? "Your session has expired. Please sign in again." : "Your settings could not be saved. Please try again.");
      throw cause;
    } finally { setIsSaving(false); }
  }, [preferences]);

  const value = useMemo(() => ({ preferences, isLoading, hasLoaded, isSaving, error, isAuthenticated, updatePreferences, refreshPreferences }), [preferences, isLoading, hasLoaded, isSaving, error, isAuthenticated, updatePreferences, refreshPreferences]);
  return <UserPreferencesContext.Provider value={value}>{children}</UserPreferencesContext.Provider>;
}

export function useUserPreferences() {
  const value = useContext(UserPreferencesContext);
  if (!value) throw new Error("useUserPreferences must be used inside UserPreferencesProvider");
  return value;
}
