"use client";

import { useEffect, useState } from "react";

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
  persistKey,
  className,
}: {
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  persistKey?: string;
  /** Extra classes on the card, for callers that constrained their own width. */
  className?: string;
}) {
  // Every section remembers its collapsed state, so minimising a window is a
  // preference rather than something lost on the next navigation.
  const storageKey = `money-os:section:${persistKey ?? title}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "open" || saved === "closed") setOpen(saved === "open");
  }, [storageKey]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (storageKey) window.localStorage.setItem(storageKey, next ? "open" : "closed");
      return next;
    });
  };

  return (
    <div className={className ? `card ${className}` : "card"}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
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
