"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  "/accounts": ["/interest"],
  "/investments": ["/positions", "/connections"],
  "/transactions": ["/import"],
};

export default function Nav() {
  const pathname = usePathname();

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

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--border)] p-4 min-h-screen flex flex-col">
      <div
        style={{ fontFamily: "var(--font-heading)" }}
        className="text-lg mb-6 tracking-tight text-[var(--foreground)]"
      >
        Money OS
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
  );
}
