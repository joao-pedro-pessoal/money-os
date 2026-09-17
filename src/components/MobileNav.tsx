"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavigationActive } from "@/lib/navigation";
import { useNav } from "./NavContext";
import { useMobileMode } from "./MobileMode";

const shortcuts = [
  { href: "/", label: "Home", path: "m3 10 9-7 9 7v10H3Z M9 20v-7h6v7" },
  { href: "/accounts", label: "Accounts", path: "M3 7h18v13H3Z M3 7V4h15v3 M16 12h5v4h-5Z" },
  { href: "/transactions", label: "Cash flow", path: "M7 3v18m-4-4 4 4 4-4 M17 21V3m-4 4 4-4 4 4" },
  { href: "/investments", label: "Invest", path: "M3 3v18h18 M6 15l5-5 4 3 6-8 M16 5h5v5" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { open, setOpen } = useNav();
  const { simple } = useMobileMode();
  const moreActive = !shortcuts.some(({ href }) => (!simple || href !== "/investments") && isNavigationActive(pathname, href));

  return (
    <nav className="mobile-bottom-nav" aria-label="Quick navigation">
      {shortcuts.map(({ href, label, path }) => (
        <Link key={href} href={href} aria-current={isNavigationActive(pathname, href) ? "page" : undefined}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
          <span>{label}</span>
        </Link>
      ))}
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="app-nav" data-active={moreActive || undefined}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        <span>More</span>
      </button>
    </nav>
  );
}
