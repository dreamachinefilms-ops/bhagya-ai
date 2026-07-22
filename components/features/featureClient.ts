import { supabase } from "@/lib/supabaseClient";

export async function authenticatedPost<T>(url: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in to continue.");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const data = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(data.message || "The request could not be completed.");
  return data;
}
