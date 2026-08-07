"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/money-map", label: "Money Map" },
  { href: "/analytics", label: "Analytics" },
  { href: "/accounts", label: "Accounts" },
  { href: "/buckets", label: "Buckets" },
  { href: "/transactions", label: "Cash Flow" },
  { href: "/interest", label: "Interest" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

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
            <Link
              href={l.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                pathname === l.href
                  ? "bg-[var(--surface-2)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
