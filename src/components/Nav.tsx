"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNav } from "./NavContext";

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
      { href: "/budgets", label: "Budgets" },
      { href: "/buckets", label: "Buckets" },
      { href: "/subscriptions", label: "Subscriptions" },
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

/**
 * Pages that belong to a sidebar entry without being under its URL.
 * Keeps the parent lit while you're on one of its tabs.
 */
const OWNED_BY: Record<string, string[]> = {
  "/analytics": ["/statistics", "/money-map"],
  "/accounts": ["/interest", "/liabilities"],
  "/investments": ["/positions", "/connections"],
  "/transactions": ["/import"],
};

export default function Nav() {
  const pathname = usePathname();
  const { open, setOpen } = useNav();

  const isActive = (href: string) => {
    // "/" is exact, or it would match every page.
    if (href === "/") return pathname === "/";
    if (pathname === href || pathname.startsWith(`${href}/`)) return true;
    return (OWNED_BY[href] ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
  };

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
   * Off-canvas rather than collapsed to icons: eleven entries in three labelled
   * groups don't survive being reduced to glyphs, and a menu you open on
   * purpose costs one tap while a row of ambiguous icons costs a guess.
   */
  return (
    <>
      {/* Covers the page while the drawer is over it, and closes on a tap. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <nav
        id="app-nav"
        className={`
          border-r border-[var(--border)] p-4 flex flex-col
          bg-[var(--background)]
          fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto
          transition-transform duration-200 ease-out
          motion-reduce:transition-none
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:static md:translate-x-0 md:w-56 md:shrink-0 md:min-h-screen md:z-auto
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
              onClick={() => setOpen(false)}
              className="icon-btn"
              aria-label="Close menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

      <div className="space-y-5 flex-1">
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
                  <Link href={l.href} className={linkClass(l.href)}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Settings and the manual are both somewhere you go rarely and
          deliberately, so they sit apart from the pages you actually work in. */}
      <div className="pt-4 mt-4 border-t border-[var(--border)] space-y-1">
        <Link href="/manual" className={linkClass("/manual")}>
          Manual
        </Link>
        <Link href="/settings" className={linkClass("/settings")}>
          Settings
        </Link>
      </div>
      </nav>
    </>
  );
}
