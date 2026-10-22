"use client";

import { useText } from "@/components/useText";
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
  const uiText = useText();
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
              <span translate="no">{fmt(Math.abs(change.change), currency)}</span>
              {change.percent !== null && ` (${change.percent.toFixed(1)}%)`}
            </span>
          )}
        </div>
        {action}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <label className="min-w-0 text-xs text-[var(--muted)]">{uiText("Period")}<select aria-label={uiText("Chart period")} value={range} onChange={(e) => pickRange(e.target.value as RangeKey)} className="input w-full mt-1">
            {RANGES.map((r) => <option key={r.value} value={r.value}>{uiText(r.label ?? "")}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-xs text-[var(--muted)]">{uiText("Group points by")}<select
            aria-label={uiText("Group chart points by")}
            value={bucket}
            onChange={(e) => {
              setBucket(e.target.value as Bucket);
              setTouchedBucket(true);
            }}
            className="input w-full mt-1"
          >
            {BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {uiText(b.label ?? "")}
              </option>
            ))}
          </select>
        </label>
      </div>

      {range === "custom" && (
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <label className="min-w-0">{uiText("From")}<input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input w-full min-w-0 mt-1"
          />
          </label>
          <label className="min-w-0">{uiText("To")}<input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input w-full min-w-0 mt-1"
          />
          </label>
        </div>
      )}

      {view.length < 2 ? (
        <div className="text-sm text-[var(--muted)] py-10 text-center">
          {series.length === 0
            ? uiText("No history yet. This fills in as your balances change and your connections sync.")
            : uiText("Not enough points in this window — try a longer range.")}
        </div>
      ) : (
        <NetWorthChart
          data={view.map((p) => ({ date: p.date, netWorth: p.value }))}
          currency={currency}
        />
      )}

      {note && <div className="text-xs text-[var(--muted)] mt-2">{typeof note === "string" ? uiText(note) : note}</div>}
    </div>
  );
}
