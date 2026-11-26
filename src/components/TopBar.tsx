"use client";

import { directionOf } from "@/lib/i18n/languages";
import { usePrivacy } from "./PrivacyContext";
import { useTheme } from "./ThemeContext";
import { useNav } from "./NavContext";
import AlertBell from "./AlertBell";
import type { Alert } from "@/lib/alerts/rules";
import { useLanguage } from "./LanguageContext";
import { readText } from "@/lib/accounts/readText";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { localeOf } from "@/lib/i18n/languages";
import { greetingFor } from "@/lib/ui/phoneSummary";
import { useText } from "./useText";

const never = () => () => {};

/**
 * The phone's home screen opens with the day and a greeting (F30) instead of
 * the app's name. Read on the device, after hydration, so the server's clock
 * and time zone never decide what "this afternoon" is.
 */
function PhoneGreeting() {
  const { language } = useLanguage();
  const uiText = useText();
  const hour = useSyncExternalStore(never, () => new Date().getHours(), () => null);
  const day = useSyncExternalStore(never, () => new Date().toLocaleDateString(localeOf(language), { weekday: "long", day: "numeric", month: "long" }), () => "");
  if (hour === null) return <span className="mobile-brand">Money OS</span>;
  return (
    <div className="phone-greeting">
      <span>{day}</span>
      <strong>{uiText(greetingFor(hour))}</strong>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.6 21.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function SunMoonIcon({ light }: { light: boolean }) {
  return light ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export default function TopBar({ alerts, alertsRetryAfter, quickEntry }: { alerts: Alert[]; alertsRetryAfter?: number; quickEntry?: React.ReactNode }) {
  const { hidden, toggle } = usePrivacy();
  const { mode, toggleMode } = useTheme();
  const { open, setOpen } = useNav();
  const { t, language } = useLanguage();
  const pathname = usePathname();

  return (
    <div lang={language} dir={directionOf(language)} className="app-topbar flex items-center gap-2 px-4 md:px-8 pt-4 md:pt-6">
      {/*
        Opens the nav drawer. Only exists where the nav is a drawer.

        `md:hidden` sits on the wrapper, not on the button: `.icon-btn` sets
        `display: inline-flex` in globals.css, which is declared after the
        Tailwind import and so beats a utility of equal specificity. Any
        `md:hidden` written directly on an `.icon-btn` is silently ignored.
      */}
      <div className="md:hidden topbar-menu">
        <button translate="no"
          onClick={() => setOpen(!open)}
          className="icon-btn"
          aria-label={t.openMenu}
          aria-expanded={open}
          aria-controls="app-nav"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 min-w-0">{pathname === "/" ? <PhoneGreeting /> : <span className="mobile-brand">Money OS</span>}</div>
      {quickEntry}

      {/* Only rendered when there is something to say; see AlertBell. */}
      {alertsRetryAfter
        ? <span role="status" className="text-xs text-[var(--muted)] max-w-48">{readText(language).unavailable}</span>
        : <AlertBell alerts={alerts} />}

      <button translate="no"
        onClick={toggle}
        className="icon-btn topbar-privacy"
        aria-label={hidden ? t.showValues : t.hideValues}
        title={hidden ? t.showValues : t.hideValues}
      >
        <EyeIcon open={!hidden} />
      </button>
      <button translate="no"
        onClick={toggleMode}
        className="icon-btn topbar-theme"
        aria-label={mode === "light" ? t.switchDark : t.switchLight}
        title={mode === "light" ? t.switchDark : t.switchLight}
      >
        <SunMoonIcon light={mode === "light"} />
      </button>
    </div>
  );
}
