"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Legend,
} from "recharts";
import DonutChart from "./DonutChart";
import { Money } from "./PrivacyContext";
import { fmt } from "@/lib/format";
import {
  byCategory,
  bySubcategory,
  byMerchant,
  byAccount,
  byMonth,
  byWeekday,
  fixedVsVariable,
  spendingTotals,
  type SpendingRow,
} from "@/lib/spending/analyse";
import {
  applySpendingFilters,
  hasActiveSpendingFilters,
  describeSpendingFilters,
  presetRange,
  NO_SPENDING_FILTERS,
  type SpendingFilters,
  type SpendingFilterOptions,
} from "@/lib/spending/filter";

/**
 * Where the money goes, over whatever slice is chosen.
 *
 * The filters narrow **one** array and every chart, tile and row derives from
 * it — so choosing a category makes the whole page about that category rather
 * than leaving a year-shaped donut beside a month-shaped table. Same
 * arrangement as `TradeHistory` and `PortfolioTable`, for the same reason.
 *
 * Every amount arrives already converted to the base currency; see
 * `actions/spending.ts` for why that happens there and not here.
 */
export default function SpendingAnalysis({
  rows,
  options,
  currency,
  unconverted,
  approximate,
}: {
  rows: SpendingRow[];
  options: SpendingFilterOptions;
  currency: string;
  unconverted: string[];
  approximate: boolean;
}) {
  const [filters, setFilters] = useState<SpendingFilters>(NO_SPENDING_FILTERS);
  const [depth, setDepth] = useState<"category" | "subcategory" | "merchant" | "account">(
    "category"
  );

  const filtered = useMemo(() => applySpendingFilters(rows, filters), [rows, filters]);

  const view = useMemo(() => {
    const groups =
      depth === "subcategory"
        ? bySubcategory(filtered)
        : depth === "merchant"
          ? byMerchant(filtered)
          : depth === "account"
            ? byAccount(filtered)
            : byCategory(filtered);

    return {
      groups,
      months: byMonth(filtered),
      weekdays: byWeekday(filtered),
      split: fixedVsVariable(filtered),
      totals: spendingTotals(filtered),
    };
  }, [filtered, depth]);

  const active = hasActiveSpendingFilters(filters);
  const describing = describeSpendingFilters(filters);
  const set = <K extends keyof SpendingFilters>(key: K, value: SpendingFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const pick = (v: string) => (v === "" ? null : v);

  /**
   * Nothing recorded at all is a different thing from nothing matching a
   * filter, and the useful answer is different too: one points at the
   * importer, the other at the filter.
   */
  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center space-y-2">
        <div className="text-sm font-medium">No spending recorded yet</div>
        <p className="text-xs text-[var(--muted)] max-w-lg mx-auto leading-relaxed">
          This page fills in from your transactions — every chart on it is computed from what you
          record, and nothing here is estimated. Add them by hand under Cash Flow, or bring in a
          bank statement from Import and they all appear at once.
        </p>
        {unconverted.length > 0 && (
          <p className="text-xs" style={{ color: "var(--amber)" }}>
            There are transactions in {unconverted.join(", ")} with no exchange rate, so they are
            left out entirely rather than counted as {currency}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">Filter</div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["last-month", "last-3-months", "last-12-months", "this-year"] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  const r = presetRange(p);
                  setFilters((f) => ({ ...f, from: r.from, to: r.to }));
                }}
                className="text-xs px-2 py-1 rounded border border-[var(--border)]"
              >
                {p.replace(/-/g, " ")}
              </button>
            ))}
            {active && (
              <button
                onClick={() => setFilters(NO_SPENDING_FILTERS)}
                className="text-xs text-[var(--accent)]"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <Select
            label="Category"
            value={filters.categoryName ?? ""}
            onChange={(v) => set("categoryName", pick(v))}
            options={options.categories}
          />
          <Select
            label="Subcategory"
            value={filters.subcategoryName ?? ""}
            onChange={(v) => set("subcategoryName", pick(v))}
            options={options.subcategories}
          />
          <Select
            label="Merchant"
            value={filters.merchant ?? ""}
            onChange={(v) => set("merchant", pick(v))}
            options={options.merchants}
          />
          <Select
            label="Account"
            value={filters.accountName ?? ""}
            onChange={(v) => set("accountName", pick(v))}
            options={options.accounts}
          />
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">From</span>
            <input
              type="date"
              className="input input-narrow text-xs w-full"
              value={filters.from ?? ""}
              onChange={(e) => set("from", pick(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">To</span>
            <input
              type="date"
              className="input input-narrow text-xs w-full"
              value={filters.to ?? ""}
              onChange={(e) => set("to", pick(e.target.value))}
            />
          </label>
        </div>

        {(options.hasFixed || options.hasVariable) && (
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] text-[var(--muted)]">Show</span>
            {([null, "fixed", "variable"] as const).map((c) => (
              <button
                key={String(c)}
                onClick={() => set("committed", c)}
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: filters.committed === c ? "var(--accent)" : "var(--border)",
                  color: filters.committed === c ? "var(--accent)" : undefined,
                }}
              >
                {c === null ? "everything" : c === "fixed" ? "committed costs" : "what you chose"}
              </button>
            ))}
          </div>
        )}

        {describing !== null && (
          <p className="text-xs mt-3" style={{ color: "var(--accent)" }}>
            Every figure below is {describing} — {filtered.length} of {rows.length} transactions.
          </p>
        )}

        {active && filtered.length === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            Nothing matches that combination. Each filter has transactions of its own; they just
            have none in common.
          </p>
        )}

        {/* Rows, but none of them spending — a month of only income and
            transfers. The charts are empty and that is the reason. */}
        {filtered.length > 0 && view.totals.spent === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}, none of them
            spending — income and transfers between your own accounts do not appear in the charts
            below.
          </p>
        )}

        {unconverted.length > 0 && (
          <p className="text-xs mt-3" style={{ color: "var(--amber)" }}>
            No exchange rate for {unconverted.join(", ")}. Those transactions are left out of every
            figure here rather than counted as {currency}.
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Spent" value={view.totals.spent} currency={currency} tone="var(--red)" />
        <Tile label="Received" value={view.totals.income} currency={currency} tone="var(--green)" />
        <Tile
          label="Net"
          value={view.totals.net}
          currency={currency}
          tone={view.totals.net >= 0 ? "var(--green)" : "var(--red)"}
        />
        <div className="card p-3">
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">
            Committed share
          </div>
          {/* Null when nothing was spent: no spending means the question has no
              answer, and 0% would claim nothing was committed. */}
          <div className="text-xl font-semibold mt-1">
            {view.split.fixedShare === null ? "—" : `${view.split.fixedShare.toFixed(0)}%`}
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            {view.split.fixedShare === null
              ? "nothing spent"
              : `${fmt(view.split.variable, currency)} was yours to choose`}
          </div>
        </div>
      </div>

      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">Where it went</div>
          <div className="flex gap-1">
            {(["category", "subcategory", "merchant", "account"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: depth === d ? "var(--accent)" : "var(--border)",
                  color: depth === d ? "var(--accent)" : undefined,
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {view.groups.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">
            No spending in this slice.
          </p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <DonutChart
              data={view.groups.slice(0, 8).map((g) => ({ name: g.name, value: g.spent }))}
              currency={currency}
            />
            <div className="overflow-auto max-h-72">
              <table className="data-table whitespace-nowrap text-xs w-full">
                <thead>
                  <tr>
                    <th>{depth}</th>
                    <th className="text-right">Spent</th>
                    <th className="text-right">Share</th>
                    <th className="text-right">Count</th>
                    <th className="text-right">Largest</th>
                  </tr>
                </thead>
                <tbody>
                  {view.groups.map((g) => (
                    <tr
                      key={g.name}
                      className="cursor-pointer"
                      onClick={() =>
                        depth === "category"
                          ? set("categoryName", g.name === "Uncategorised" ? null : g.name)
                          : depth === "merchant"
                            ? set("merchant", g.name)
                            : depth === "account"
                              ? set("accountName", g.name)
                              : set("subcategoryName", g.name)
                      }
                    >
                      <td>{g.name}</td>
                      <td className="text-right">
                        <Money value={g.spent} currency={currency} />
                      </td>
                      <td className="text-right text-[var(--muted)]">{g.share.toFixed(1)}%</td>
                      <td className="text-right text-[var(--muted)]">{g.count}</td>
                      <td className="text-right text-[var(--muted)]">
                        <Money value={g.largest} currency={currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view.totals.uncategorised > 0 && (
          <p className="text-xs mt-3" style={{ color: "var(--amber)" }}>
            <Money value={view.totals.uncategorised} currency={currency} /> has no category on it.
            That is the pile worth naming first — everything else on this page gets sharper once
            it has.
          </p>
        )}
      </section>

      <section className="card p-4">
        <div className="text-sm font-medium mb-3">Month by month</div>
        {view.months.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">Nothing to plot.</p>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={view.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("pt-PT", { notation: "compact" }).format(Number(v))
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--foreground)",
                  }}
                  formatter={(value, name) => [fmt(Number(value), currency), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="In" fill="var(--green)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="spent" name="Out" fill="var(--red)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="text-sm font-medium mb-1">Which day it goes</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Seven bars whatever the data — a quiet Tuesday is a measurement, and hiding it would
          make the week look busier than it is.
        </p>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={view.weekdays} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={52}
                tickFormatter={(v) =>
                  new Intl.NumberFormat("pt-PT", { notation: "compact" }).format(Number(v))
                }
              />
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
              <Bar dataKey="spent" radius={[3, 3, 0, 0]}>
                {view.weekdays.map((d) => (
                  <Cell
                    key={d.weekday}
                    // Weekends read differently from working days, and the
                    // difference is usually the point.
                    fill={d.weekday >= 5 ? "var(--chart-2)" : "var(--accent)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {approximate && (
        <p className="text-xs text-[var(--muted)]">
          Amounts in another currency were converted at today&apos;s rate, so figures from earlier
          months are approximate.
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  currency,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone: string;
}) {
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{label}</div>
      <div className="text-xl font-semibold mt-1" style={{ color: tone }}>
        <Money value={value} currency={currency} />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-[var(--muted)] block mb-1">{label}</span>
      <select
        className="input input-narrow text-xs w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={options.length === 0}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
