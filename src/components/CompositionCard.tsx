"use client";

import { useState } from "react";
import DonutChart from "./DonutChart";
import { Money } from "./PrivacyContext";
import { fmt } from "@/lib/format";

/**
 * A breakdown, drawn the way you want to read it.
 *
 * Three shapes for the same numbers, because they answer different questions.
 * A doughnut shows proportion and is hopeless once the smallest slice is under
 * a few percent. Bars compare sizes honestly at any scale. A list is the only
 * one that gives you the actual figures without hovering, which is what you
 * want when you're checking rather than exploring.
 *
 * The choice lives in this component and nowhere else — no preference to save,
 * no setting to find. It costs one click to change and nothing to get wrong.
 */
export type ChartShape = "donut" | "bars" | "list";

const SHAPES: { value: ChartShape; label: string }[] = [
  { value: "donut", label: "Donut" },
  { value: "bars", label: "Bars" },
  { value: "list", label: "List" },
];

const COLORS = [
  "var(--accent)",
  "var(--green)",
  "var(--amber)",
  "var(--red)",
  "#7aa2f7",
  "#bb9af7",
  "#7dcfff",
  "#e0af68",
  "var(--muted)",
];

export default function CompositionCard({
  title,
  data,
  currency = "EUR",
  defaultShape = "donut",
  note,
}: {
  title: string;
  data: { name: string; value: number }[];
  currency?: string;
  defaultShape?: ChartShape;
  note?: React.ReactNode;
}) {
  const [shape, setShape] = useState<ChartShape>(defaultShape);

  const total = data.reduce((s, d) => s + d.value, 0);
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const largest = sorted[0]?.value ?? 0;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {total > 0 && (
            <div className="text-[10px] text-[var(--muted)] mt-0.5">
              <Money value={total} currency={currency} /> in total
            </div>
          )}
        </div>
        <div className="flex gap-1 text-[10px] shrink-0">
          {SHAPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setShape(s.value)}
              className="px-1.5 py-0.5 rounded"
              style={{
                background: shape === s.value ? "var(--surface-2)" : "transparent",
                color: shape === s.value ? "var(--accent)" : "var(--muted)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-[var(--muted)] py-8 text-center">No data yet</div>
      ) : shape === "donut" ? (
        <DonutChart data={sorted} currency={currency} />
      ) : shape === "bars" ? (
        /* Bars scaled to the largest entry, not to the total. Against the total
           every slice of a well-spread portfolio is a stub, and the comparison
           you actually want — this one against that one — becomes unreadable. */
        <div className="space-y-2">
          {sorted.map((d, i) => (
            <div key={d.name}>
              <div className="flex items-baseline justify-between gap-2 text-xs mb-0.5">
                <span className="truncate">{d.name}</span>
                <span className="text-[var(--muted)] shrink-0">
                  <Money value={d.value} currency={currency} />
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${largest > 0 ? (d.value / largest) * 100 : 0}%`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {sorted.map((d, i) => (
              <tr key={d.name} className="border-b border-[var(--border)] last:border-0">
                <td className="py-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  {d.name}
                </td>
                <td className="py-1.5 text-right text-[var(--muted)] tabular-nums">
                  {total > 0 ? `${Math.round((d.value / total) * 1000) / 10}%` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  <Money value={d.value} currency={currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {note && <div className="text-[10px] text-[var(--muted)] mt-3 leading-snug">{note}</div>}
    </div>
  );
}

/**
 * Budgets: what you set against what you've spent.
 *
 * Not a composition, so not the component above. A budget has a *limit*, and
 * the only question worth answering at a glance is whether you're past it —
 * which a proportional chart cannot show, because going over is precisely the
 * case where the proportions stop adding to a whole.
 */
export function BudgetBars({
  items,
  currency = "EUR",
}: {
  items: {
    id: string;
    name: string;
    limit: number;
    spent: number;
    remaining: number;
    percent: number;
    status: string;
    pacingOver?: boolean;
  }[];
  currency?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-[var(--muted)] py-8 text-center">
        No budgets set yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((b) => {
        const over = b.spent > b.limit;
        // Capped at 100 so the bar stays inside its track; the overspend is
        // stated in words instead, where it can't be mistaken for a full bar.
        const filled = b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
        const colour = over ? "var(--red)" : b.pacingOver ? "var(--amber)" : "var(--green)";

        return (
          <div key={b.id}>
            <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
              <span className="truncate">{b.name}</span>
              <span className="text-[var(--muted)] shrink-0 tabular-nums">
                <Money value={b.spent} currency={currency} /> of{" "}
                <Money value={b.limit} currency={currency} />
              </span>
            </div>

            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="h-full rounded-full" style={{ width: `${filled}%`, background: colour }} />
            </div>

            <div className="text-[10px] mt-0.5" style={{ color: over ? "var(--red)" : "var(--muted)" }}>
              {over
                ? `${fmt(b.spent - b.limit, currency)} over`
                : b.pacingOver
                  ? `${fmt(b.remaining, currency)} left, but spending faster than the month`
                  : `${fmt(b.remaining, currency)} left`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
