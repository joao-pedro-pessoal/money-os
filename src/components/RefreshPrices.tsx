"use client";

import { useState } from "react";
import { refreshQuotedPrices } from "@/actions/quotes";

/**
 * Updates every position that has a price symbol.
 *
 * Manual rather than automatic on purpose. A background job that quietly
 * repriced everything would make it impossible to tell, looking at a figure,
 * whether it came from a source you chose or from one that drifted — and the
 * whole design here is that pricing is opt-in per position.
 */
export default function RefreshPrices() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ symbol: string; note: string }[]>([]);

  const run = async () => {
    setBusy(true);
    setSummary(null);
    setFailures([]);
    try {
      const result = await refreshQuotedPrices();
      setSummary(
        result.attempted === 0
          ? "No position has a price symbol yet."
          : `${result.updated} of ${result.attempted} updated.`
      );
      setFailures(result.results.filter((r) => !r.ok).map((r) => ({ symbol: r.symbol, note: r.note })));
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="text-xs">
      <button type="button" onClick={run} disabled={busy} style={{ color: "var(--accent)" }}>
        {busy ? "Fetching…" : "Refresh prices"}
      </button>
      {summary && <span className="text-[var(--muted)] ml-2">{summary}</span>}
      {/* Each failure named: a position that kept its old price looks identical
          to one that was just updated, and only this says which is which. */}
      {failures.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {failures.map((f) => (
            <li key={f.symbol} className="text-[10px]" style={{ color: "var(--amber)" }}>
              {f.symbol}: {f.note}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
