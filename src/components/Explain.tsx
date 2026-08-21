"use client";

import { useState, useId } from "react";

/**
 * What a number on screen actually counts.
 *
 * Every figure on this dashboard is the result of a decision — which money is
 * cash, which is invested, what "free" excludes — and those decisions have been
 * the source of nearly every question asked about this app. The answers existed
 * only in code comments, where nobody looking at the number could read them.
 *
 * Deliberately not the browser's `title` attribute: it waits a second, can't be
 * styled, disappears on touch, and truncates. This shows on hover *and* on
 * keyboard focus, so the explanation is reachable without a mouse.
 */
export default function Explain({
  children,
  title,
  body,
}: {
  children: React.ReactNode;
  title: string;
  /** One or more paragraphs. Short: this is a footnote, not documentation. */
  body: string | string[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const paragraphs = Array.isArray(body) ? body : [body];

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {/* Focusable so the explanation is reachable by keyboard, and described
          by the popover so a screen reader reads it rather than skipping it. */}
      <div tabIndex={0} aria-describedby={open ? id : undefined} className="outline-none">
        {children}
      </div>

      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg p-3 shadow-lg"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-strong)",
            minWidth: "16rem",
          }}
        >
          <div className="text-xs font-medium mb-1">{title}</div>
          {paragraphs.map((p, i) => (
            <p key={i} className="text-[11px] text-[var(--muted)] leading-snug mt-1 first:mt-0">
              {p}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
