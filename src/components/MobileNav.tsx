"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavigationActive } from "@/lib/navigation";
import { useNav } from "./NavContext";
import { useMobileMode } from "./MobileMode";
import { useLanguage } from "./LanguageContext";
import type { Messages } from "@/lib/i18n/messages";

/**
 * The phone's bottom bar. Its words come from the chosen language like the
 * rest of the menu: they were written in English here, so choosing a language
 * changed nothing at all on a phone.
 */
const shortcuts: { href: string; word: keyof Messages["nav"]; path: string }[] = [
  { href: "/", word: "home", path: "m3 10 9-7 9 7v10H3Z M9 20v-7h6v7" },
  { href: "/accounts", word: "accounts", path: "M3 7h18v13H3Z M3 7V4h15v3 M16 12h5v4h-5Z" },
  { href: "/transactions", word: "cashFlowShort", path: "M7 3v18m-4-4 4 4 4-4 M17 21V3m-4 4 4-4 4 4" },
  { href: "/investments", word: "invest", path: "M3 3v18h18 M6 15l5-5 4 3 6-8 M16 5h5v5" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { open, setOpen } = useNav();
  const { simple } = useMobileMode();
  const { t } = useLanguage();
  const moreActive = !shortcuts.some(({ href }) => (!simple || href !== "/investments") && isNavigationActive(pathname, href));

  return (
    <nav className="mobile-bottom-nav" aria-label={t.quickNavigation}>
      {shortcuts.map(({ href, word, path }) => (
        <Link key={href} href={href} aria-current={isNavigationActive(pathname, href) ? "page" : undefined}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
          <span>{t[word] as string}</span>
        </Link>
      ))}
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="app-nav" data-active={moreActive || undefined}>
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        <span>{t.more}</span>
      </button>
    </nav>
  );
}
