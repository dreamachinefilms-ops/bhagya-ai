import { NextResponse } from "next/server";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";
import { requireUser } from "@/lib/backend/auth";
import { checkRateLimit } from "@/lib/backend/rateLimit";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function POST(request: Request) {
  const { user } = await requireUser(request);
  const key = user?.id || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
  const rate = checkRateLimit(`contact:${key}`);
  if (!rate.allowed) return NextResponse.json({ error: "RATE_LIMITED", message: "Too many messages. Please wait before trying again." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter || 60) } });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Complete all contact fields." }, { status: 400 });
  const row = body as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  const subject = typeof row.subject === "string" ? row.subject.trim() : "";
  const message = typeof row.message === "string" ? row.message.trim() : "";
  if (!name || name.length > 100 || !emailPattern.test(email) || email.length > 254 || !subject || subject.length > 160 || message.length < 10 || message.length > 5000) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Enter a valid name, email, subject and message (at least 10 characters)." }, { status: 400 });
  try {
    const supabase = createSupabaseUserClient(request);
    const { error } = await supabase.from("contact_messages").insert({ user_id: user?.id || null, name, email, subject, message, status: "new" });
    if (error) throw error;
    return NextResponse.json({ success: true, message: "Your message has been sent." }, { status: 201 });
  } catch (error) {
    console.error("[contact] storage failed", error instanceof Error ? error.message : typeof error);
    return NextResponse.json({ error: "CONTACT_SAVE_FAILED", message: "Your message could not be sent. Please try again." }, { status: 500 });
  }
}
