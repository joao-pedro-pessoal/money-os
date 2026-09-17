"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNav } from "./NavContext";
import { ACCOUNTS_TABS, ANALYTICS_TABS, INVESTMENT_TABS, isNavigationActive } from "@/lib/navigation";
import { logout } from "@/app/login/actions";
import { useMobileMode } from "./MobileMode";
import MobileFold from "./MobileFold";
import { useLanguage } from "./LanguageContext";

/**
 * Eleven entries in three groups, down from fifteen in a flat list.
 *
 * What changed and why:
 * - Money Map showed the same two breakdowns as Analytics; it redirects there.
 * - Statistics is a tab inside Analytics — both answer "how is this going?".
 * - Interest is a tab inside Accounts; interest is received *by* an account.
 * - Open Positions and Connections are tabs inside Investments.
 * - "Import statement" was an action masquerading as a place. It lives on the
 *   Cash Flow page, which is the data it changes, and in Settings → Your data.
 */
const groups: { label?: string; links: { href: string; label: string }[] }[] = [
  {
    links: [
      { href: "/", label: "Dashboard" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/accounts", label: "Accounts" },
      { href: "/transactions", label: "Cash Flow" },
      { href: "/savings", label: "Savings" },
      { href: "/budgets", label: "Budgets" },
      { href: "/buckets", label: "Buckets" },
      { href: "/subscriptions", label: "Subscriptions" },
      // The other direction. Subscriptions forecast what leaves; this is what
      // is due to arrive, and neither is counted in a balance.
      { href: "/expected", label: "Coming in" },
    ],
  },
  {
    label: "Learning",
    links: [
      { href: "/library", label: "Library" },
    ],
  },
  {
    label: "Not guaranteed",
    links: [{ href: "/investments", label: "Investments" }],
  },
];

// Reuse the page tabs so search follows the same destinations and labels.
const searchablePages = [
  ...groups.flatMap(group => group.links),
  ...ACCOUNTS_TABS,
  ...ANALYTICS_TABS,
  ...INVESTMENT_TABS,
  { href: "/import", label: "Import statement" },
  { href: "/manual", label: "Manual" },
  { href: "/settings", label: "Settings" },
].filter((link, index, pages) => pages.findIndex(page => page.href === link.href) === index);

export default function Nav() {
  const pathname = usePathname();
  const { open, setOpen } = useNav();
  const { simple } = useMobileMode();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;
  const labelFor = (href: string, fallback: string) => ({
    "/": t.dashboard, "/analytics": t.analytics, "/accounts": t.accounts, "/transactions": t.cashFlow,
    "/savings": t.savings, "/budgets": t.budgets, "/buckets": t.buckets, "/subscriptions": t.subscriptions,
    "/expected": t.comingIn, "/library": t.library, "/investments": t.investments, "/manual": t.manual,
    "/settings": t.settings,
  }[href] ?? fallback);
  const matches = searchablePages.filter(link =>
    terms.every(term => `${link.label} ${link.href}`.toLowerCase().includes(term)),
  );

  function closeMenu() {
    setOpen(false);
    setQuery("");
  }

  const isActive = (href: string) => isNavigationActive(pathname, href);

  const linkClass = (href: string) =>
    `block rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? "bg-[var(--surface-2)] text-[var(--foreground)]"
        : "text-[var(--muted)] hover:text-[var(--foreground)]"
    }`;

  /**
   * A fixed rail on a wide screen, a drawer on a narrow one.
   *
   * It used to be `w-56 shrink-0` at every width, which on a 375px phone left
   * 87px for the content once the page padding was taken off — every table and
   * every card squeezed into a column narrower than the sidebar beside it.
   *
   * The complete menu stays in this drawer. MobileNav offers four labeled
   * shortcuts and opens this same drawer for every other destination.
   */
  return (
    <>
      {/* Covers the page while the drawer is over it, and closes on a tap. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <nav
        id="app-nav"
        className={`
          app-nav border-r border-[var(--border)] p-4 flex flex-col
          bg-[var(--background)]
          fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto
          transition-transform duration-200 ease-out
          motion-reduce:transition-none
          ${open ? "translate-x-0 visible" : "-translate-x-full invisible"}
          md:visible md:static md:translate-x-0 md:w-56 md:shrink-0 md:min-h-screen md:z-auto
        `}
        aria-label="Main"
      >
        <div className="flex items-center justify-between mb-6">
          <div
            style={{ fontFamily: "var(--font-heading)" }}
            className="text-lg tracking-tight text-[var(--foreground)]"
          >
            Money OS
          </div>
          {/*
            Only reachable when the drawer is showing; the rail has no close.
            The wrapper carries `md:hidden` because `.icon-btn` sets its own
            `display` later in globals.css and would win against the utility.
          */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={closeMenu}
              className="icon-btn"
              aria-label="Close menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

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
          {query && <button type="button" className="icon-btn shrink-0" aria-label="Clear page search"
            onClick={() => { setQuery(""); searchInput.current?.focus(); }}>×</button>}
        </div>
      </div>

      <div id="nav-pages" className="space-y-5 flex-1">
        {searching ? <div>
          <p role="status" className="px-3 mb-2 text-sm text-[var(--muted)]">
            {matches.length === 0 ? t.noPages : `${matches.length} ${matches.length === 1 ? "page" : "pages"} found`}
          </p>
          <ul className="space-y-1">
            {matches.map(link => <li key={link.href}>
              <Link href={link.href} className={linkClass(link.href)}
                aria-current={pathname === link.href ? "page" : undefined} onClick={closeMenu}>
                {labelFor(link.href, link.label)}
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
          <MobileFold simpleOnly title="More pages" persistKey="simple-navigation">
            <ul className="space-y-1">
              {groups.flatMap(group => group.links).filter(link => !["/", "/accounts", "/transactions", "/savings", "/budgets", "/investments"].includes(link.href)).map(link => <li key={link.href}><Link href={link.href} className={linkClass(link.href)} aria-current={isActive(link.href) ? "page" : undefined} onClick={() => setOpen(false)}>{labelFor(link.href, link.label)}</Link></li>)}
            </ul>
          </MobileFold>
        </> : <>
        {groups.map((g, i) => (
          <div key={g.label ?? i}>
            {g.label && (
              <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                {g.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass(l.href)} aria-current={isActive(l.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                    {labelFor(l.href, l.label)}
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
      </nav>
    </>
  );
}
