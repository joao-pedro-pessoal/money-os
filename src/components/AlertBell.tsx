"use client";

import { useState } from "react";
import Link from "next/link";
import type { Alert } from "@/lib/alerts/rules";

/**
 * What needs your attention, one tap away.
 *
 * The bell only exists when something is wrong. An icon that is always there
 * and usually empty trains you to ignore it, and by the time it matters you no
 * longer see it. Nothing to say, nothing on screen.
 *
 * The count on it is critical + warning only. Informational items — a
 * subscription charging on Friday, a watchlist target hit — belong in the list
 * but not in a number that is meant to mean "something is wrong".
 */

const TONE: Record<Alert["severity"], { colour: string; label: string }> = {
  critical: { colour: "var(--red)", label: "Needs fixing" },
  warning: { colour: "var(--amber)", label: "Worth a look" },
  info: { colour: "var(--muted)", label: "For information" },
};

export default function AlertBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);

  if (alerts.length === 0) return null;

  const pressing = alerts.filter((a) => a.severity !== "info").length;
  const worst = alerts[0].severity;

  return (
    <div className="relative">
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="icon-btn relative"
          aria-label={`${alerts.length} thing${alerts.length === 1 ? "" : "s"} need attention`}
          aria-expanded={open}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {pressing > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[9px] font-medium flex items-center justify-center"
              style={{ background: TONE[worst].colour, color: "var(--background)" }}
            >
              {pressing}
            </span>
          )}
        </button>
      </div>

      {open && (
        <>
          {/* Clicking anywhere else closes it, which is what people expect of
              a panel that opened from a button. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="card absolute right-0 mt-2 z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto"
            role="dialog"
            aria-label="Attention"
          >
            <div className="p-3 border-b border-[var(--border)] text-xs font-medium">
              {alerts.length} thing{alerts.length === 1 ? "" : "s"} to look at
            </div>

            <ul>
              {alerts.map((a) => (
                <li key={a.id} className="border-b border-[var(--border)] last:border-b-0">
                  <Link
                    href={a.href}
                    onClick={() => setOpen(false)}
                    className="block p-3 hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      {/* Severity as a shape, not only as a word — the list is
                          scanned, not read. */}
                      <span
                        className="mt-1.5 shrink-0 rounded-full"
                        style={{ width: 6, height: 6, background: TONE[a.severity].colour }}
                        title={TONE[a.severity].label}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium">{a.title}</div>
                        {a.detail && (
                          <div className="text-[11px] text-[var(--muted)] mt-0.5">{a.detail}</div>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
