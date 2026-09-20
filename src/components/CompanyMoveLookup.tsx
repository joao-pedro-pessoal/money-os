"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshCompanyMoves } from "@/actions/exposure";

/**
 * Reads how each company held has moved over the last year.
 *
 * The company's own move, which is a fact about the share price — not your
 * return, which a fund cannot tell you. Only listings leave the machine.
 */
export default function CompanyMoveLookup({ due = 0 }: { due?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await refreshCompanyMoves();
      const parts: string[] = [];
      if (r.read > 0) parts.push(`${r.read} companies read.`);
      if (r.unanswered.length > 0) {
        const shown = r.unanswered.slice(0, 6).join(", ");
        parts.push(
          `Nothing answered for ${r.unanswered.length}${r.unanswered.length > 6 ? ` (${shown}, …)` : `: ${shown}`}.`
        );
      }
      if (r.remaining > 0) parts.push(`${r.remaining} still to read — press again.`);
      if (r.problem) parts.push(r.problem);
      setMessage(parts.join(" ") || "Every company is up to date.");
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
        {busy ? "Reading the companies…" : due > 0 ? `Read how the companies moved (${due})` : "Refresh how the companies moved"}
      </button>
      {message && (
        <span role="status" className="text-xs text-[var(--muted)]">
          {message}
        </span>
      )}
    </div>
  );
}
