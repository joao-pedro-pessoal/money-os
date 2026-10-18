"use client";

import { useText } from "@/components/useText";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshLogos } from "@/actions/logos";

/**
 * Reads the marks of the things you hold and of the companies inside your
 * funds.
 *
 * Only listings leave the machine, and nothing on any screen depends on this
 * having been pressed: a company with no mark shows its first letter and every
 * figure beside it is unchanged.
 */
export default function LogoLookup({ due = 0 }: { due?: number }) {
  const uiText = useText();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await refreshLogos();
      const parts: string[] = [];
      if (r.read > 0) parts.push(`${r.read} logos read.`);
      if (r.unanswered.length > 0) parts.push(`${r.unanswered.length} have none published.`);
      if (r.remaining > 0) parts.push(`${r.remaining} still to read — press again.`);
      if (r.problem) parts.push(r.problem);
      setMessage(parts.join(" ") || uiText("Every logo is up to date."));
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : uiText("The read failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" className="btn" onClick={run} disabled={busy}>
        {busy ? uiText("Reading the logos…") : due > 0 ? uiText("Read the logos ({0})", { "0": due }) : uiText("Refresh the logos")}
      </button>
      {message && (
        <span role="status" className="text-xs text-[var(--muted)]">
          {uiText(message ?? "")}
        </span>
      )}
    </div>
  );
}
