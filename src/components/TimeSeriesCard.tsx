"use client";

import { useMemo, useState } from "react";
import NetWorthChart from "@/components/NetWorthChart";
import { fmt } from "@/lib/format";
import {
  applyView,
  changeOver,
  suggestBucket,
  BUCKETS,
  RANGES,
  type Bucket,
  type RangeKey,
  type Point,
} from "@/lib/stats/timeframe";

/**
 * A chart you can zoom in time.
 *
 * Range and bucket are separate controls because they answer different
 * questions: how far back, and at what resolution. Three months of daily
 * points is noise; three months of monthly points is three dots.
 *
 * The change figure is measured across the visible window, not all history,
 * because that's the question the range picker was used to ask.
 */
export default function TimeSeriesCard({
  title,
  series,
  currency,
  note,
  action,
}: {
  title: string;
  series: Point[];
  currency: string;
  note?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [range, setRange] = useState<RangeKey>("3m");
  const [bucket, setBucket] = useState<Bucket>(suggestBucket("3m"));
  const [touchedBucket, setTouchedBucket] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const view = useMemo(
    () => applyView(series, { bucket, range, custom: { from: from || null, to: to || null } }),
    [series, bucket, range, from, to]
  );
  const change = useMemo(() => changeOver(view), [view]);

  function pickRange(next: RangeKey) {
    setRange(next);
    // The suggested resolution follows the range until you overrule it, and
    // then it stops second-guessing you.
    if (!touchedBucket) setBucket(suggestBucket(next));
  }

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-sm font-medium">{title}</span>
          {change && (
            <span
              className="text-xs"
              style={{ color: change.change >= 0 ? "var(--green)" : "var(--red)" }}
            >
              {change.change >= 0 ? "+" : "−"}
              {fmt(Math.abs(change.change), currency)}
              {change.percent !== null && ` (${change.percent.toFixed(1)}%)`}
            </span>
          )}
        </div>
        {action}
      </div>

      <div className="flex gap-3 flex-wrap items-center mb-3">
        <div className="flex gap-1 flex-wrap">
          {RANGES.filter((r) => r.value !== "custom").map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => pickRange(r.value)}
              className="badge border text-[10px]"
              style={{
                borderColor: range === r.value ? "var(--accent)" : "var(--border)",
                color: range === r.value ? "var(--accent)" : "var(--muted)",
              }}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pickRange("custom")}
            className="badge border text-[10px]"
            style={{
              borderColor: range === "custom" ? "var(--accent)" : "var(--border)",
              color: range === "custom" ? "var(--accent)" : "var(--muted)",
            }}
          >
            Custom
          </button>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-[var(--muted)]">Every</span>
          <select
            value={bucket}
            onChange={(e) => {
              setBucket(e.target.value as Bucket);
              setTouchedBucket(true);
            }}
            className="input input-narrow text-xs py-0.5"
          >
            {BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {range === "custom" && (
        <div className="flex gap-2 items-center mb-3 text-xs">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input input-narrow text-xs py-1"
          />
          <span className="text-[var(--muted)]">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input input-narrow text-xs py-1"
          />
        </div>
      )}

      {view.length < 2 ? (
        <div className="text-sm text-[var(--muted)] py-10 text-center">
          {series.length === 0
            ? "No history yet. This fills in as your balances change and your connections sync."
            : "Not enough points in this window — try a longer range."}
        </div>
      ) : (
        <NetWorthChart
          data={view.map((p) => ({ date: p.date, netWorth: p.value }))}
          currency={currency}
        />
      )}

      {note && <div className="text-xs text-[var(--muted)] mt-2">{note}</div>}
    </div>
  );
}
