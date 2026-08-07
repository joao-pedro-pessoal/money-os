"use client";

import { useEffect, useRef, useState, useTransition } from "react";

/**
 * Keeps connected platforms up to date without anyone clicking anything.
 *
 * Syncs once shortly after the app opens (if the data is older than
 * `staleMinutes`) and then on an interval while the tab stays open. Anything
 * unattended — syncing while the app is closed — still needs the scheduled
 * POST /api/sync route; a browser can't do that.
 */
export default function AutoSync({
  syncAction,
  lastSyncAt,
  staleMinutes = 5,
  intervalMinutes = 5,
}: {
  syncAction: () => Promise<void>;
  lastSyncAt: string | null;
  staleMinutes?: number;
  intervalMinutes?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [ranAt, setRanAt] = useState<Date | null>(null);
  // Guards against React 18 double-mounting in dev firing two syncs.
  const started = useRef(false);

  useEffect(() => {
    const isStale = () => {
      if (!lastSyncAt) return true;
      const ageMinutes = (Date.now() - new Date(lastSyncAt).getTime()) / 60000;
      return ageMinutes >= staleMinutes;
    };

    const run = () => {
      // Don't waste a request on a tab sitting in the background.
      if (document.visibilityState !== "visible") return;
      startTransition(async () => {
        await syncAction();
        setRanAt(new Date());
      });
    };

    if (!started.current) {
      started.current = true;
      if (isStale()) run();
    }

    const id = setInterval(run, intervalMinutes * 60_000);
    return () => clearInterval(id);
  }, [syncAction, lastSyncAt, staleMinutes, intervalMinutes]);

  return (
    <div className="text-xs text-[var(--muted)]">
      {isPending ? (
        <span className="text-[var(--accent)]">Syncing…</span>
      ) : ranAt ? (
        <>Auto-synced at {ranAt.toLocaleTimeString("pt-PT")} · refreshes every {intervalMinutes} min</>
      ) : (
        <>Auto-syncs every {intervalMinutes} min while this page is open</>
      )}
    </div>
  );
}
