"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivacy } from "./PrivacyContext";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/money-map", label: "Money Map" },
  { href: "/accounts", label: "Accounts" },
  { href: "/buckets", label: "Buckets" },
  { href: "/transactions", label: "Cash Flow" },
  { href: "/interest", label: "Interest" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  const { hidden, toggle } = usePrivacy();

  return (
    <nav className="w-56 shrink-0 border-r border-[var(--border)] p-4 flex flex-col justify-between min-h-screen">
      <div>
        <div className="text-sm font-semibold mb-6 tracking-tight">Money OS</div>
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
      </div>
      <button onClick={toggle} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] text-left">
        {hidden ? "Show values" : "Hide values"} (Privacy Mode)
      </button>
    </nav>
  );
}
