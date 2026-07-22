"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/kundli-matching", label: "Kundli Matching" },
  { href: "/about", label: "About Bhagya" },
  { href: "/contact", label: "Contact Us" },
];

export default function TopNavigation({ accountLink }: { accountLink?: { href: string; label: string } }) {
  const pathname = usePathname();
  const [horoscopeOpen, setHoroscopeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const horoscopeActive = pathname.startsWith("/horoscope");
  const itemClass = (active: boolean) => `rounded-lg px-3 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${active ? "bg-sky-400/[.08] text-[#63cfff]" : "text-white/65 hover:bg-sky-400/[.08] hover:text-white"}`;

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) { if (!rootRef.current?.contains(event.target as Node)) { setHoroscopeOpen(false); setMobileOpen(false); } }
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") { setHoroscopeOpen(false); setMobileOpen(false); } }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);

  const closeAll = () => { setHoroscopeOpen(false); setMobileOpen(false); };

  return <div ref={rootRef} className="relative z-50">
    <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
      <div className="relative flex items-center">
        <Link href="/horoscope" prefetch aria-current={horoscopeActive ? "page" : undefined} onClick={closeAll} className={itemClass(horoscopeActive)}>Horoscope</Link>
        <button type="button" onClick={() => setHoroscopeOpen((open) => !open)} aria-label="Open Horoscope menu" aria-expanded={horoscopeOpen} aria-haspopup="menu" className="rounded-lg px-1.5 py-2 text-white/45 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-400">⌄</button>
        {horoscopeOpen && <div role="menu" className="absolute left-0 top-[calc(100%+8px)] w-64 rounded-2xl border border-sky-300/15 bg-[#07162b]/[.98] p-2 shadow-2xl shadow-black/35 backdrop-blur-xl">
          <NavDetail href="/horoscope/daily" title="Daily Horoscope" detail="Guidance for your current day" active={pathname === "/horoscope/daily"} onClick={closeAll} />
          <NavDetail href="/horoscope/love" title="Love Horoscope" detail="Relationship and emotional guidance" active={pathname === "/horoscope/love"} onClick={closeAll} />
        </div>}
      </div>
      {links.map((link) => <Link key={link.href} href={link.href} prefetch aria-current={pathname === link.href ? "page" : undefined} className={itemClass(pathname === link.href)}>{link.label}</Link>)}
    </nav>

    <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-label="Open navigation menu" aria-expanded={mobileOpen} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-lg text-white/70 focus-visible:outline-2 focus-visible:outline-sky-400 lg:hidden">☰</button>
    {mobileOpen && <nav aria-label="Mobile navigation" className="absolute right-0 top-[calc(100%+10px)] w-[min(290px,calc(100vw-24px))] rounded-2xl border border-sky-300/15 bg-[#07162b]/[.98] p-2 shadow-2xl shadow-black/35 backdrop-blur-xl lg:hidden">
      <Link href="/horoscope" prefetch onClick={closeAll} className={itemClass(horoscopeActive)}>Horoscope</Link>
      <div className="ml-3 border-l border-white/10 pl-2"><NavDetail href="/horoscope/daily" title="Daily Horoscope" detail="Guidance for your day" active={pathname === "/horoscope/daily"} onClick={closeAll} /><NavDetail href="/horoscope/love" title="Love Horoscope" detail="Love and relationship guidance" active={pathname === "/horoscope/love"} onClick={closeAll} /></div>
      {links.map((link) => <Link key={link.href} href={link.href} prefetch onClick={closeAll} aria-current={pathname === link.href ? "page" : undefined} className={`mt-1 block ${itemClass(pathname === link.href)}`}>{link.label}</Link>)}
      <div className="mt-2 border-t border-white/[.08] pt-2"><Link href="/settings" prefetch onClick={closeAll} className={`block ${itemClass(pathname === "/settings")}`}>Settings</Link></div>
      {accountLink && <Link href={accountLink.href} prefetch onClick={closeAll} className={`mt-1 block ${itemClass(pathname === accountLink.href)}`}>{accountLink.label}</Link>}
    </nav>}
  </div>;
}

function NavDetail({ href, title, detail, active, onClick }: { href: string; title: string; detail: string; active: boolean; onClick: () => void }) {
  return <Link href={href} prefetch role="menuitem" aria-current={active ? "page" : undefined} onClick={onClick} className={`block rounded-xl px-3 py-2.5 transition focus-visible:outline-2 focus-visible:outline-sky-400 ${active ? "bg-sky-400/10 text-sky-200" : "text-white/75 hover:bg-sky-400/[.08] hover:text-white"}`}><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-xs leading-5 text-white/35">{detail}</span></Link>;
}
