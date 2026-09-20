"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshCompanyDetails } from "@/actions/exposure";

/**
 * Reads what each company inside your funds is — sector, industry, country.
 *
 * Needed because a fund's ten largest holdings, which is all the price source
 * publishes for some funds, name the company and nothing else about it.
 */
export default function CompanyDetailLookup({ due = 0 }: { due?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await refreshCompanyDetails();
      const parts: string[] = [];
      if (r.read > 0) parts.push(`${r.read} companies read.`);
      if (r.unanswered.length > 0) {
        parts.push(`No sector or country published for ${r.unanswered.slice(0, 6).join(", ")}.`);
      }
      if (r.remaining > 0) parts.push(`${r.remaining} still to read — press again.`);
      if (r.problem) parts.push(r.problem);
      setMessage(parts.join(" ") || "Every company is classified.");
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
        {busy ? "Reading the companies…" : due > 0 ? `Read what each company is (${due})` : "Refresh what each company is"}
      </button>
      {message && (
        <span role="status" className="text-xs text-[var(--muted)]">
          {message}
        </span>
      )}
    </div>
  );
}
