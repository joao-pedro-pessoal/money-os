"use client";

import { NONE, toggled } from "@/lib/filters/multi";

/**
 * A filter field that takes several values: a button that opens a list of
 * boxes. Nothing ticked means everything. Built on <details>, so it opens and
 * closes without script and a phone's back gesture is not involved.
 */
export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
  render = (v) => v,
  noneLabel,
}: {
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** How a value reads on screen. */
  render?: (value: string) => string;
  /** Offers "none" as a choice — no playlist, no tag — with this wording. */
  noneLabel?: string;
}) {
  const all = noneLabel ? [...options, NONE] : [...options];
  const shown = (v: string) => (v === NONE ? noneLabel ?? "None" : render(v));
  const summary =
    selected.length === 0 ? "All" : selected.length === 1 ? shown(selected[0]) : `${selected.length} chosen`;
  return (
    <div className="block min-w-0">
      <span className="text-[10px] text-[var(--muted)] block mb-1">{label}</span>
      <details className="relative">
        <summary
          className={`input input-narrow text-xs w-full cursor-pointer list-none truncate ${selected.length > 0 ? "text-[var(--accent)]" : ""}`}
          aria-label={`${label}: ${summary}`}
        >
          <span translate="no">{summary}</span>
        </summary>
        <div className="absolute z-20 mt-1 w-64 max-w-[80vw] max-h-72 overflow-auto card p-2 space-y-1 shadow-lg">
          {all.length === 0 && <p className="text-xs text-[var(--muted)]">Nothing to choose.</p>}
          {all.map((v) => (
            <label key={v} className="flex items-center gap-2 text-xs py-0.5">
              <input type="checkbox" checked={selected.includes(v)} onChange={() => onChange(toggled(selected, v))} />
              <span translate="no" className="break-all">
                {shown(v)}
              </span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="text-xs text-[var(--accent)] pt-1" onClick={() => onChange([])}>
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
