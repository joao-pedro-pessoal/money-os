"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageContext";

/** What the Android app exposes to its own pages. Absent in a browser and in apps before 0.7.0. */
type AndroidBridge = {
  alertNotificationsEnabled?: () => boolean;
  setAlertNotifications?: (enabled: boolean) => void;
};

function bridge(): AndroidBridge | null {
  const candidate = (window as typeof window & { MoneyOSAndroid?: AndroidBridge }).MoneyOSAndroid;
  return candidate?.setAlertNotifications ? candidate : null;
}

/**
 * Alerts as phone notifications, in the Android app.
 *
 * Like the quick-entry switch, it shows what the app reports back through
 * `money-os:alert-notifications`, because the system may refuse the permission.
 */
export default function PhoneAlertSettings() {
  const w = useLanguage().m.settings;
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const app = bridge();
    if (!app) return;
    // Read once the page runs inside the app; the server cannot know.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAvailable(true);
    setEnabled(Boolean(app.alertNotificationsEnabled?.()));
    /* eslint-enable react-hooks/set-state-in-effect */
    const handle = (event: Event) => {
      setEnabled(Boolean((event as CustomEvent<boolean>).detail));
      setWaiting(false);
    };
    window.addEventListener("money-os:alert-notifications", handle);
    return () => window.removeEventListener("money-os:alert-notifications", handle);
  }, []);

  if (!available) return null;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">{w.alertsTitle}</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">{w.alertsText}</p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={waiting}
          onChange={(event) => {
            setWaiting(true);
            bridge()?.setAlertNotifications?.(event.target.checked);
          }}
        />
        {w.alertsToggle}
      </label>
    </div>
  );
}
