"use client";

import { useState } from "react";
import { buildConversionPrompt, CANONICAL_EXAMPLE } from "@/lib/csv/prompt";

/**
 * Turns "my bank's CSV is a mess" into a solved problem.
 *
 * Every bank writes a different file, Open Banking needs a licence, and the
 * free aggregator tier hobby projects relied on has closed. So rather than
 * chase formats, the app states one format and hands you a prompt that converts
 * anything into it — a CSV, a PDF's text, even a table copied off a webpage.
 */
export default function StatementPrompt({
  categories,
  currency,
  defaultOpen = false,
}: {
  categories: string[];
  currency: string;
  /** Open on the dedicated import page, collapsed when it's a link from elsewhere. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const prompt = buildConversionPrompt({ categories, currency });

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card p-4" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Your bank&apos;s format doesn&apos;t matter</div>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">
            Copy the instruction below, paste it into any AI along with your statement — the CSV your bank
            gave you, text copied out of a PDF, even a table off the screen — and it returns a file this
            importer reads without you mapping anything.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(!open)} className="btn whitespace-nowrap">
          {open ? "Hide" : "Show the instruction"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={copy} className="btn">
              {copied ? "Copied" : "Copy instruction"}
            </button>
          </div>

          <pre className="text-[10px] font-mono bg-[var(--surface)] border border-[var(--border)] rounded p-3 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
            {prompt}
          </pre>

          <div>
            <div className="text-xs font-medium mb-1">What should come back</div>
            <pre className="text-[10px] font-mono bg-[var(--surface)] border border-[var(--border)] rounded p-3 overflow-x-auto">
              {CANONICAL_EXAMPLE}
            </pre>
          </div>

          <div className="text-xs text-[var(--muted)] space-y-2">
            <p>
              Save the answer as a <span className="font-mono">.csv</span> file and upload it below. If the AI
              wrapped it in <span className="font-mono">```</span> fences, delete those two lines — the
              preview will tell you if you forget.
            </p>
            {categories.length > 0 && (
              <p>
                The instruction lists your existing categories so they get reused. Nothing new is ever created
                from a file: a suggestion that doesn&apos;t match one you already have is simply left blank.
              </p>
            )}
            <p className="text-[var(--amber)]">
              This means handing your statement to whichever AI you use. Nothing is sent anywhere by this app —
              you do the copying — but it is still your bank data going to a third party, so decide that
              deliberately. Removing account numbers first costs nothing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
