"use client";

import Link from "next/link";

const PENDING_QUESTION_KEY = "bhagya_pending_question_v1";
const PENDING_SERVICE_KEY = "bhagya_pending_service_v1";

export default function AstrologyChatLink({ prompt, children }: { prompt: string; children: React.ReactNode }) {
  return <Link href="/" prefetch onClick={() => { localStorage.setItem(PENDING_QUESTION_KEY, prompt); localStorage.setItem(PENDING_SERVICE_KEY, "astrology"); }} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 font-semibold text-white shadow-lg shadow-sky-950/40 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">{children}</Link>;
}
