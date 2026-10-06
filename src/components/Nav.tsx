"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNav } from "./NavContext";
import NavFrame, { navLinkClass } from "./NavFrame";
import { NAV_GROUPS as groups, SEARCHABLE_PAGES as searchablePages, isNavigationActive } from "@/lib/navigation";
import { logout } from "@/app/login/actions";
import { useMobileMode } from "./MobileMode";
import MobileFold from "./MobileFold";
import { useLanguage } from "./LanguageContext";
import { labelIn } from "@/lib/i18n/messages";

export default function Nav() {
  const pathname = usePathname();
  const { setOpen } = useNav();
  const { simple } = useMobileMode();
  const { t, m } = useLanguage();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  // Pages are named in English where they are defined (labelIn translates them by that name).
  // Found by either name, so a page can be looked for in the language it is shown in.
  const matches = searchablePages.filter(link =>
    terms.every(term => `${link.label} ${labelIn(m, link.label)} ${link.href}`.toLowerCase().includes(term)),
  );

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  const isActive = (href: string) => isNavigationActive(pathname, href);

  const linkClass = (href: string) => navLinkClass(isActive(href));

  /**
   * The frame — rail on a wide screen, drawer on a narrow one — is NavFrame.
   * The complete menu stays in this drawer. MobileNav
   * offers four labeled shortcuts and opens this same drawer for every other
   * destination.
   */
  return (
    <NavFrame onClose={closeMenu}>
      <div className="mb-5">
        <label htmlFor="nav-search" className="block mb-1.5 text-sm text-[var(--muted)]">{t.findPage}</label>
        <div className="flex gap-1 items-center">
          <input ref={searchInput} id="nav-search" type="search" className="input min-w-0 w-full"
            placeholder={t.searchPages} autoComplete="off" value={query}
            aria-controls="nav-pages" onChange={event => setQuery(event.target.value)}
            onKeyDownCapture={event => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }} />
          {query && <button type="button" className="icon-btn shrink-0" aria-label={t.clearSearch}
            onClick={() => { setQuery(""); searchInput.current?.focus(); }}>×</button>}
        </div>
      </div>

      <div id="nav-pages" className="space-y-5 flex-1">
        {searching ? <div>
          <p role="status" className="px-3 mb-2 text-sm text-[var(--muted)]">
            {matches.length === 0 ? t.noPages : t.pagesFound(matches.length)}
          </p>
          <ul className="space-y-1">
            {matches.map(link => <li key={link.href}>
              <Link href={link.href} className={linkClass(link.href)}
                aria-current={pathname === link.href ? "page" : undefined} onClick={closeMenu}>
                {labelIn(m, link.label)}
              </Link>
            </li>)}
          </ul>
        </div> : simple ? <>
          <ul className="space-y-1">
            {[
              { href: "/", label: t.home }, { href: "/accounts", label: t.accounts }, { href: "/transactions", label: t.cashFlow },
              { href: "/savings", label: t.savings }, { href: "/budgets", label: t.budgets }, { href: "/investments", label: t.investments },
            ].map(link => <li key={link.href}><Link href={link.href} className={linkClass(link.href)} aria-current={isActive(link.href) ? "page" : undefined} onClick={() => setOpen(false)}>{link.label}</Link></li>)}
          </ul>
          <MobileFold simpleOnly title={t.morePages} persistKey="simple-navigation">
            <ul className="space-y-1">
              {groups.flatMap(group => group.links).filter(link => !["/", "/accounts", "/transactions", "/savings", "/budgets", "/investments"].includes(link.href)).map(link => <li key={link.href}><Link href={link.href} className={linkClass(link.href)} aria-current={isActive(link.href) ? "page" : undefined} onClick={() => setOpen(false)}>{labelIn(m, link.label)}</Link></li>)}
            </ul>
          </MobileFold>
        </> : <>
        {groups.map((g, i) => (
          <div key={g.label ?? i}>
            {g.label && (
              <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {t[g.label]}
              </div>
            )}
            <ul className="space-y-0.5">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass(l.href)} aria-current={isActive(l.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                    {labelIn(m, l.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        </>}
      </div>

      {/* Settings and the manual are both somewhere you go rarely and
          deliberately, so they sit apart from the pages you actually work in. */}
      <div className="pt-4 mt-4 border-t border-[var(--border)] space-y-1">
        <Link href="/manual" className={linkClass("/manual")} aria-current={isActive("/manual") ? "page" : undefined} onClick={() => setOpen(false)}>
          {t.manual}
        </Link>
        <Link href="/settings" className={linkClass("/settings")} aria-current={isActive("/settings") ? "page" : undefined} onClick={() => setOpen(false)}>
          {t.settings}
        </Link>
        <form action={logout}>
          <button type="submit" className="w-full min-h-11 rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            {t.logOut}
          </button>
        </form>
      </div>
    </NavFrame>
  );
}
