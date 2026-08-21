"use client";

import { useState } from "react";

/**
 * A dashboard block that can be folded away.
 *
 * The dashboard has to carry the headline figures, the buckets, every account
 * and the charts. All of it open at once is a page nobody reads to the bottom,
 * so the numbers you check daily stay open and the detail folds.
 *
 * `summary` is shown in the header, so a closed section still tells you
 * something — collapsing should hide the detail, not the fact.
 */
export default function Section({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-4 text-left"
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="flex items-center gap-3 text-xs text-[var(--muted)]">
          {summary}
          <span
            className="transition-transform inline-block"
            style={{ transform: open ? "rotate(90deg)" : undefined }}
          >
            ›
          </span>
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
