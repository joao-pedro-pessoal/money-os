"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/money-map", label: "Money Map" },
  { href: "/analytics", label: "Analytics" },
  { href: "/statistics", label: "Statistics" },
  { href: "/accounts", label: "Accounts" },
  { href: "/buckets", label: "Buckets" },
  { href: "/transactions", label: "Cash Flow" },
  { href: "/interest", label: "Interest" },
  { href: "/settings", label: "Settings" },
];

const investmentLinks = [
  { href: "/investments", label: "Investments" },
  { href: "/positions", label: "Open Positions" },
  { href: "/connections", label: "Connections" },
];

export default function Nav() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `block rounded-lg px-3 py-2 text-sm ${
      pathname === href
        ? "bg-[var(--surface-2)] text-[var(--foreground)]"
        : "text-[var(--muted)] hover:text-[var(--foreground)]"
    }`;

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--border)] p-4 min-h-screen">
      <div
        style={{ fontFamily: "var(--font-heading)" }}
        className="text-lg mb-6 tracking-tight text-[var(--foreground)]"
      >
        Money OS
      </div>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={linkClass(l.href)}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 pt-4 border-t border-[var(--border)]">
        <div className="px-3 mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Not guaranteed
        </div>
        <ul className="space-y-1">
          {investmentLinks.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={linkClass(l.href)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
