"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshFundFiles } from "@/actions/exposure";

/**
 * Reads the complete holdings file each fund's manager publishes.
 *
 * Its own button, apart from the sector look-up: a different source, half a
 * megabyte a fund, and one failing should not take the other's work with it.
 */
export default function FundFileLookup({ due = 0 }: { due?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await refreshFundFiles();
      const parts: string[] = [];
      if (r.read > 0) parts.push(`${r.read} fund${r.read === 1 ? "" : "s"} read in full.`);
      if (r.unsupported > 0) {
        parts.push(`${r.unsupported} publish no file this can read yet, and keep their ten largest holdings.`);
      }
      for (const f of r.failed) parts.push(`${f.fund}: ${f.reason}.`);
      if (r.remaining > 0) parts.push(`${r.remaining} still to read — press again.`);
      if (r.problem) parts.push(r.problem);
      setMessage(parts.join(" ") || "Every fund is up to date.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The read failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" className="btn" onClick={run} disabled={busy}>
        {busy ? "Reading the funds…" : due > 0 ? `Read what the funds hold (${due})` : "Refresh what the funds hold"}
      </button>
      {message && (
        <span role="status" className="text-xs text-[var(--muted)]">
          {message}
        </span>
      )}
    </div>
  );
}
