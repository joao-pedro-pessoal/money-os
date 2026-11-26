"use client";

import { directionOf } from "@/lib/i18n/languages";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavigationActive } from "@/lib/navigation";
import { useLanguage } from "./LanguageContext";
import { useText } from "./useText";
import PhoneIcon from "./PhoneIcon";
import type { PhoneIconName } from "@/lib/ui/phoneIcons";
import type { Messages } from "@/lib/i18n/messages";

/**
 * The phone's bottom bar (F30): four places and, in the middle, the button
 * that records money from any screen. It used to be four places, the menu and
 * a separate floating button that covered the last row of every list.
 *
 * "More" is a page of its own with everything else, so the side menu is no
 * longer the only way to reach a page on a phone. Its words come from the
 * chosen language like the rest of the menu.
 */
const places: { href: string; word: keyof Messages["nav"]; icon: PhoneIconName }[] = [
  { href: "/", word: "home", icon: "home" },
  { href: "/accounts", word: "accounts", icon: "wallet" },
  { href: "/transactions", word: "cashFlowShort", icon: "flows" },
  { href: "/more", word: "more", icon: "grid" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { t, language, m } = useLanguage();
  const uiText = useText();
  const listed = places.slice(0, 3).some(({ href }) => isNavigationActive(pathname, href));

  const link = ({ href, word, icon }: (typeof places)[number]) => {
    const current = href === "/more" ? !listed : isNavigationActive(pathname, href);
    return (
      <Link key={href} href={href} aria-current={current ? "page" : undefined}>
        <PhoneIcon name={icon} size={22} strokeWidth={current ? 2 : 1.8} />
        <span>{word === "more" ? uiText("More") : t[word] as string}</span>
      </Link>
    );
  };

  return (
    <nav translate="no" lang={language} dir={directionOf(language)} className="mobile-bottom-nav" aria-label={t.quickNavigation}>
      {places.slice(0, 2).map(link)}
      <button
        type="button"
        className="mobile-record"
        aria-label={m.quickEntry.open}
        onClick={() => window.dispatchEvent(new CustomEvent("money-os:quick-entry", { detail: "expense" }))}
      >
        <PhoneIcon name="plus" size={24} strokeWidth={2.4} />
      </button>
      {places.slice(2).map(link)}
    </nav>
  );
}
