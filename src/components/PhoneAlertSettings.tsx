"use client";

import { useEffect, useState } from "react";

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
        <div className="text-sm font-medium">Alerts on this phone</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">
          A notification for what the bell would show you: a budget over or running ahead, a
          subscription about to charge or waiting to be confirmed, a balance not updated in two
          months, a connection that stopped syncing, a watchlist price reached. Each one once. The
          phone checks about every half hour, and only hears while it can reach this computer: on
          the same Wi-Fi, with the site running.
        </p>
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
        Alert notifications
      </label>
    </div>
  );
}
