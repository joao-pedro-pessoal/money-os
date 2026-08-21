"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tabs for pages that belong together but live at sibling URLs.
 *
 * Lets one sidebar entry cover several screens: the sidebar answers "what am I
 * looking at", the tabs answer "which part of it". Without this, every screen
 * needs its own line in the nav and the nav stops being scannable.
 */
export default function PageTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-[var(--border)] flex gap-1 -mb-px overflow-x-auto">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors"
            style={{
              borderBottomColor: active ? "var(--accent)" : "transparent",
              color: active ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
