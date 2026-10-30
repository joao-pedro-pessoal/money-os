"use client";

import { useText } from "@/components/useText";
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
export const SLICE_COLORS = [
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

/** The five largest slices and one "Other" for the rest: a glance, not an audit. */
export function topSlices(data: { name: string; value: number }[], keep: number, other: string) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep).reduce((s, d) => s + d.value, 0);
  return [...sorted.slice(0, keep), { name: other, value: Math.round(rest * 100) / 100 }];
}

export default function DonutChart({
  data,
  currency = "EUR",
  compact = false,
}: {
  data: { name: string; value: number }[];
  currency?: string;
  /** A small doughnut beside its legend, for the top of a page or a dashboard section. */
  compact?: boolean;
}) {
  const uiText = useText();
  const { hidden } = usePrivacy();

  if (data.length === 0) {
    return <div className="text-sm text-[var(--muted)] py-8 text-center">{uiText("No data yet")}</div>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  const share = (v: number) => (total > 0 ? Math.round((v / total) * 1000) / 10 : 0);

  if (compact) {
    const slices = topSlices(data, 5, uiText("Other"));
    return (
      <div className="flex items-center gap-4">
        <div translate="no" className="dashboard-chart shrink-0" style={{ width: 112, height: 112 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie isAnimationActive={false} data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="100%"
                paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                {slices.map((_, i) => <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul translate="no" className="flex-1 min-w-0 space-y-1.5">
          {slices.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: 999, background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
              <span className="truncate" title={d.name}>{d.name}</span>
              <span className="ml-auto shrink-0 text-[var(--muted)] tabular-nums">{share(d.value)}%</span>
              {!hidden && <span className="shrink-0 tabular-nums">{fmt(d.value, currency)}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      {/*
        The fixed height belongs to the chart alone. The legend used to sit
        inside this box, so it rendered on top of the doughnut and the labels
        collided into each other.
      */}
      <div translate="no" className="dashboard-chart" style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              isAnimationActive={false}
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
                <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
              ))}
            </Pie>
            {!hidden && (
              <Tooltip
                wrapperStyle={{ maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere" }}
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
      <ul translate="no" className="mt-3 space-y-1">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span
              className="shrink-0"
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: SLICE_COLORS[i % SLICE_COLORS.length],
              }}
            />
            <span className="truncate text-[var(--muted)]" title={d.name}>
              <span translate="no">{d.name}</span>
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
