"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshAssetProfiles } from "@/actions/exposure";

/**
 * Reads sector, country, fund holdings, TER and announced dividend dates for
 * the stocks and ETFs that have none yet or whose profile is due again.
 *
 * On a button rather than on every visit: it asks an outside service about
 * each listing, which takes a few seconds and should happen when you choose.
 */
export default function ProfileLookup({ due = 0, label }: { due?: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await refreshAssetProfiles();
      const parts: string[] = [];
      if (r.looked > 0) parts.push(`${r.found} of ${r.looked} found.`);
      if (r.notFound.length > 0) parts.push(`Not found: ${r.notFound.join(", ")}.`);
      if (r.remaining > 0) parts.push(`${r.remaining} still to look up — press again.`);
      if (r.problem) parts.push(r.problem);
      setMessage(parts.join(" ") || "Everything is up to date.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The look-up failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" className="btn" onClick={run} disabled={busy}>
        {busy ? "Looking up…" : label ?? (due > 0 ? `Look up sectors & countries (${due})` : "Refresh sectors & countries")}
      </button>
      {message && (
        <span role="status" className="text-xs text-[var(--muted)]">
          {message}
        </span>
      )}
    </div>
  );
}
