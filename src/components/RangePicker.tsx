"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Two days for a custom report, and a button to show it.
 *
 * Navigates the way `FilterSelect` does — to an address the page built, with
 * the scroll kept — rather than through a GET form: `path` already carries
 * every other choice on the page, so only the two days are added here.
 */
export default function RangePicker({
  from,
  to,
  max,
  path,
}: {
  from: string;
  to: string;
  /** The last day that can be chosen: today, since a report covers what happened. */
  max: string;
  /** The report's address without the two days. */
  path: string;
}) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const invalid = start === "" || end === "" || start > end;

  return (
    <form
      className="report-actions flex gap-2 flex-wrap items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        router.push(`${path}&from=${start}&to=${end}`, { scroll: false });
      }}
    >
      <label className="text-xs text-[var(--muted)] flex flex-col gap-1">
        From
        <input type="date" value={start} max={end || max} onChange={(e) => setStart(e.target.value)} className="input" required />
      </label>
      <label className="text-xs text-[var(--muted)] flex flex-col gap-1">
        To
        <input type="date" value={end} min={start} max={max} onChange={(e) => setEnd(e.target.value)} className="input" required />
      </label>
      <button type="submit" className="btn" disabled={invalid}>
        Show
      </button>
    </form>
  );
}
