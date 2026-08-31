"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { usePrivacy } from "./PrivacyContext";
import { fmt } from "@/lib/format";

/**
 * Every slice colour comes from the theme, none from here.
 *
 * Four of these used to be literal hex — `#7aa2f7`, `#bb9af7`, `#7dcfff`,
 * `#e0af68` — so the monochrome theme was not monochrome: a donut with five or
 * more slices put blue, purple and cyan on a page that had deliberately thrown
 * away every hue. A theme can only be honoured by components that ask it.
 *
 * The order matters. The first four are the tokens that already mean something
 * elsewhere, so a two- or three-slice chart reads consistently with the rest of
 * the page; `--chart-1` onwards are the categorical ones, which mean nothing
 * beyond "not the last one".
 */
const COLORS = [
  "var(--accent)",
  "var(--green)",
  "var(--amber)",
  "var(--red)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--muted)",
];

export default function DonutChart({
  data,
  currency = "EUR",
}: {
  data: { name: string; value: number }[];
  currency?: string;
}) {
  const { hidden } = usePrivacy();

  if (data.length === 0) {
    return <div className="text-sm text-[var(--muted)] py-8 text-center">No data yet</div>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);

  return (
    <div>
      {/*
        The fixed height belongs to the chart alone. The legend used to sit
        inside this box, so it rendered on top of the doughnut and the labels
        collided into each other.
      */}
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="var(--surface)"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            {!hidden && (
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--foreground)",
                }}
                formatter={(value) => fmt(Number(value), currency)}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* One row per slice, with its share. Chips wrapped mid-word and stacked
          on top of each other; a list stays readable however long the names. */}
      <ul className="mt-3 space-y-1">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="shrink-0"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: COLORS[i % COLORS.length],
              }}
            />
            <span className="truncate text-[var(--muted)]" title={d.name}>
              {d.name}
            </span>
            <span className="ml-auto shrink-0 text-[var(--muted)]">{share(d.value)}%</span>
            {!hidden && (
              <span className="shrink-0 tabular-nums">{fmt(d.value, currency)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
