"use client";

import { useState } from "react";
import { ARRIVALS, WEEKDAYS, anchorInputFor, type Arrival } from "@/lib/accounting/expected";

/**
 * How often it arrives, and the one thing that pins it down.
 *
 * A monthly salary needs a day of the month, not a date. Asking for
 * "25 September 2026" to mean "the 25th" makes you choose a year you do not
 * care about, and a calendar showing one specific square reads as a one-off —
 * which is the opposite of what monthly means.
 *
 * So the field follows the cadence: a day for monthly, a weekday for weekly, a
 * full date for a one-off and for quarterly and yearly, which need a month too.
 * The anchor date the app stores is built from whichever was asked; see
 * `anchorFrom`.
 *
 * Client-side only because the second field depends on the first. Everything
 * else on this form is a plain server-rendered input.
 */
export default function ArrivalFields({ defaultArrival }: { defaultArrival: Arrival }) {
  const [arrival, setArrival] = useState<Arrival>(defaultArrival);
  const kind = anchorInputFor(arrival);

  return (
    <>
      <select
        name="arrival"
        className="input"
        value={arrival}
        onChange={(e) => setArrival(e.target.value as Arrival)}
      >
        {ARRIVALS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>

      {kind === "dayOfMonth" && (
        <label className="text-xs block">
          <span className="text-[var(--muted)]">Day of the month</span>
          <input
            name="dayOfMonth"
            type="number"
            min={1}
            max={31}
            placeholder="e.g. 25"
            className="input mt-1"
          />
          {/* The 31st stays the 31st. A month without one is skipped, and
              February lands on the 28th without the day being forgotten. */}
          <span className="text-[10px] text-[var(--muted)]">
            A 29th, 30th or 31st lands on the last day of a month too short for it, and goes
            back to the day you chose in the months that have it.
          </span>
        </label>
      )}

      {kind === "weekday" && (
        <label className="text-xs block">
          <span className="text-[var(--muted)]">Day of the week</span>
          <select name="weekday" className="input mt-1" defaultValue="">
            <option value="">Pick a day</option>
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {kind === "date" && (
        <label className="text-xs block">
          <span className="text-[var(--muted)]">
            When — leave empty if there is no agreed day
          </span>
          <input name="expectedAt" type="date" className="input mt-1" />
        </label>
      )}
    </>
  );
}
