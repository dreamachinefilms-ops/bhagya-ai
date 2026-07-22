import Link from "next/link";
import PublicPageShell from "@/components/layout/PublicPageShell";

export default function HoroscopePage() {
  const today = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "Asia/Kolkata" }).format(new Date());
  return <PublicPageShell><PageHeading title="Your Horoscope" description="Receive personalised guidance for the opportunities, priorities and emotional patterns shaping your day." /><div className="mx-auto mt-10 w-full max-w-[560px]"><HoroscopeCard href="/horoscope/daily" title="Daily Horoscope" eyebrow={today} description="A structured daily reflection using your securely saved birth profile." cta="View Daily Horoscope" /></div></PublicPageShell>;
}

function PageHeading({ title, description }: { title: string; description: string }) { return <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[.22em] text-sky-300/65">Bhagya guidance</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1><p className="mt-4 text-lg leading-8 text-white/50">{description}</p></div>; }
function HoroscopeCard({ href, title, eyebrow, description, cta }: { href: string; title: string; eyebrow: string; description: string; cta: string }) { return <article className="group rounded-3xl border border-white/10 bg-[#071225]/85 p-6 shadow-2xl transition hover:-translate-y-1 hover:border-sky-300/25"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/10 text-xl text-sky-200">✦</div><p className="mt-5 text-xs uppercase tracking-widest text-sky-300/55">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold">{title}</h2><p className="mt-3 min-h-14 leading-7 text-white/45">{description}</p><Link href={href} prefetch className="mt-7 inline-flex min-h-11 items-center rounded-xl border border-sky-300/20 bg-sky-400/[.08] px-4 text-sm font-medium text-sky-200 hover:bg-sky-400/[.13]">{cta} →</Link></article>; }
