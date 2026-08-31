"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

/**
 * Your return against an index, both starting at 100.
 *
 * Rebasing is what makes the two lines comparable at all — one is a portfolio
 * of a few hundred euros and the other a fund priced at several hundred a
 * share, and only their *shape* is the same kind of thing.
 *
 * The portfolio line is the time-weighted curve, never net worth. A net worth
 * line rises when money is paid in, and an index has no equivalent event, so
 * the day of a deposit would draw as a day of outperformance.
 *
 * No privacy gate on the axis: percentages of a starting point disclose no
 * amount, which is the thing `usePrivacy` hides. The figures beside the chart
 * are percentages too.
 */
export default function BenchmarkChart({
  portfolio,
  index,
  indexName,
}: {
  portfolio: { date: string; value: number }[];
  index: { date: string; value: number }[];
  indexName: string;
}) {
  /**
   * One row per date either line moved, each carrying whichever values that day
   * has. Recharts joins on the x key, and a missing value must be a gap in that
   * line rather than a zero — a benchmark dropping to 0 for one day draws a
   * cliff to the bottom of the chart and back.
   */
  const byDate = new Map<string, { date: string; you?: number; market?: number }>();
  for (const p of portfolio) {
    byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), you: p.value });
  }
  for (const p of index) {
    byDate.set(p.date, { ...(byDate.get(p.date) ?? { date: p.date }), market: p.value });
  }
  const data = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (data.length < 2) {
    return (
      <div className="text-sm text-[var(--muted)] py-12 text-center">
        Not enough overlap between your history and the index to draw a comparison.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${Math.round(Number(v))}`}
          />
          {/* Where both lines began. Above it is a gain, below it a loss, and
              the eye needs the line to tell them apart at a glance. */}
          <ReferenceLine y={100} stroke="var(--border-strong)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            formatter={(value, name) => [
              `${(Number(value) - 100 >= 0 ? "+" : "")}${(Number(value) - 100).toFixed(2)}%`,
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="you"
            name="You"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            // The two series are recorded on different days — a snapshot when
            // something changed, a close every trading day — so neither is
            // complete on the other's dates. Joining across the gaps draws the
            // line the data implies instead of chopping it into fragments.
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="market"
            name={indexName}
            stroke="var(--muted)"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
