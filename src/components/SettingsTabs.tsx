"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "./LanguageContext";
import { labelIn } from "@/lib/i18n/messages";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/categories", label: "Categories" },
  { href: "/settings/rates", label: "Currency & rates" },
  { href: "/settings/data", label: "Your data" },
  { href: "/settings/phone", label: "On your phone" },
];

/**
 * Settings used to be one long scroll with six unrelated cards, which is how
 * the statement importer ended up invisible in the middle of it. Splitting by
 * subject means each page fits on a screen and nothing hides below the fold.
 */
export default function SettingsTabs() {
  const pathname = usePathname();
  const { m } = useLanguage();

  return (
    <nav aria-label={m.nav.settingsPages} className="page-tabs border-b border-[var(--border)] flex gap-1 -mb-px overflow-x-auto">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors"
            style={{
              borderBottomColor: active ? "var(--accent)" : "transparent",
              color: active ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {labelIn(m, t.label)}
          </Link>
        );
      })}
    </nav>
  );
}
