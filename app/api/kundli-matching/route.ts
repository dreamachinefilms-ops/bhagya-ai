import { NextResponse } from "next/server";
import { requireUser } from "@/lib/backend/auth";
import { getSavedBirthDetails, isCompleteBirthDetails } from "@/lib/backend/birthDetailsMemory";
import { parseSecondPerson } from "@/lib/horoscope/validation";

export async function POST(request: Request) {
  const { user } = await requireUser(request);
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED", message: "Please sign in to continue." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const second = body && typeof body === "object" && !Array.isArray(body) ? parseSecondPerson((body as Record<string, unknown>).secondPerson) : null;
  if (!second) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Enter complete and valid details for the second person." }, { status: 400 });
  try {
    const birth = await getSavedBirthDetails({ request, userId: user.id });
    if (!isCompleteBirthDetails(birth)) return NextResponse.json({ error: "BIRTH_PROFILE_REQUIRED", message: "Complete your birth profile before matching Kundlis." }, { status: 428 });
    return NextResponse.json({ error: "KUNDLI_PROVIDER_NOT_CONFIGURED", message: "Kundli Matching is not configured yet." }, { status: 503 });
  } catch (error) {
    console.error("[kundli-matching] failed", error instanceof Error ? error.message : typeof error);
    return NextResponse.json({ error: "KUNDLI_MATCHING_FAILED", message: "The Kundli comparison could not be completed." }, { status: 500 });
  }
}
