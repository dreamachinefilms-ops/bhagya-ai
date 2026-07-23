import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { parseSecondPerson } from "@/lib/horoscope/validation";

export async function POST(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED", message: "Please sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const first = parseSecondPerson(input?.firstPerson);
  const second = parseSecondPerson(input?.secondPerson);
  if (!first || !second) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Enter complete and valid birth details for both people." }, { status: 400 });
  try {
    return NextResponse.json({ error: "KUNDLI_PROVIDER_NOT_CONFIGURED", message: "Kundli Matching is not configured yet." }, { status: 503 });
  } catch (error) {
    console.error("[kundli-matching] failed", error instanceof Error ? error.message : typeof error);
    return NextResponse.json({ error: "KUNDLI_MATCHING_FAILED", message: "The Kundli comparison could not be completed." }, { status: 500 });
  }
}
