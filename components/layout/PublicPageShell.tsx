import Link from "next/link";
import type { ReactNode } from "react";
import BhagyaLogo from "@/components/branding/BhagyaLogo";
import TopNavigation from "@/components/navigation/TopNavigation";

export default function PublicPageShell({ children }: { children: ReactNode }) {
  return <main className="min-h-[100dvh] overflow-x-hidden bg-[#020817] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,.12),transparent_42%)]" />
    <header className="sticky top-0 z-40 border-b border-sky-200/[.08] bg-[#020c1e]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" prefetch aria-label="Bhagya home" className="shrink-0 text-base"><BhagyaLogo variant="full" size={32} /></Link>
        <div className="ml-auto"><TopNavigation /></div>
      </div>
    </header>
    <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">{children}</div>
  </main>;
}
