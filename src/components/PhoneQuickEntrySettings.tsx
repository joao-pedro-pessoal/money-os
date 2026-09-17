"use client";

import { useEffect, useState } from "react";

/** What the Android app exposes to its own pages. Absent in a browser. */
type AndroidBridge = {
  quickNotificationEnabled?: () => boolean;
  setQuickNotification?: (enabled: boolean) => void;
};

function bridge(): AndroidBridge | null {
  const candidate = (window as typeof window & { MoneyOSAndroid?: AndroidBridge }).MoneyOSAndroid;
  return candidate?.setQuickNotification ? candidate : null;
}

/**
 * The quick-entry notification of the Android app.
 *
 * Shown only inside that app, where there is a notification to switch on. The
 * app answers with `money-os:quick-notification`, because the system may refuse
 * the permission and the switch must show what actually happened, not what was
 * asked for.
 */
export default function PhoneQuickEntrySettings() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const app = bridge();
    if (!app) return;
    // Read once the page runs inside the app; the server cannot know.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAvailable(true);
    setEnabled(Boolean(app.quickNotificationEnabled?.()));
    /* eslint-enable react-hooks/set-state-in-effect */
    const handle = (event: Event) => {
      setEnabled(Boolean((event as CustomEvent<boolean>).detail));
      setWaiting(false);
    };
    window.addEventListener("money-os:quick-notification", handle);
    return () => window.removeEventListener("money-os:quick-notification", handle);
  }, []);

  if (!available) return null;

  return (
    <div className="card p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Record an expense from outside the app</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">
          A notification that stays in the notification shade, with Expense and Income buttons that
          open the quick entry form. The home-screen widget and the shortcuts on the app icon (touch
          and hold it) do the same and need nothing switched on.
        </p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={waiting}
          onChange={(event) => {
            setWaiting(true);
            bridge()?.setQuickNotification?.(event.target.checked);
          }}
        />
        Quick entry notification
      </label>
    </div>
  );
}
