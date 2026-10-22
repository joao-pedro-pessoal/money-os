"use client";

import { useText } from "@/components/useText";
import ResponsiveTable from "@/components/ResponsiveTable";


import { useId, useMemo, useState } from "react";
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
  const uiText = useText();
  const [filters, setFilters] = useState<SpendingFilters>(NO_SPENDING_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [customDates, setCustomDates] = useState(false);
  const filtersId = useId();
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
  const periods = [
    { value: "last-month", label: uiText("Last month") },
    { value: "last-3-months", label: uiText("Last 3 months") },
    { value: "last-12-months", label: uiText("Last 12 months") },
    { value: "this-year", label: uiText("This year") },
  ] as const;
  const period = customDates ? "custom" : filters.from === null && filters.to === null ? "all" :
    periods.find((p) => {
      const range = presetRange(p.value);
      return range.from === filters.from && range.to === filters.to;
    })?.value ?? "custom";
  const filterCount = [filters.categoryName, filters.subcategoryName, filters.merchant, filters.accountName, filters.committed]
    .filter((value) => value !== null).length + (filters.from !== null || filters.to !== null ? 1 : 0);
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
        <div className="text-sm font-medium">{uiText("No spending recorded yet")}</div>
        <p className="text-xs text-[var(--muted)] max-w-lg mx-auto leading-relaxed">{uiText("This page fills in from your transactions — every chart on it is computed from what you record, and nothing here is estimated. Add them by hand under Cash Flow, or bring in a bank statement from Import and they all appear at once.")}</p>
        {unconverted.length > 0 && (
          <p className="text-xs" style={{ color: "var(--amber)" }}>{uiText("There are transactions in ")}{unconverted.join(", ")}{uiText(" with no exchange rate, so they are left out entirely rather than counted as ")}{currency}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-[var(--muted)]">{uiText("Period")}<select aria-label={uiText("Spending period")} className="input w-full mt-1" value={period} onChange={(event) => {
              const value = event.target.value;
              setCustomDates(value === "custom");
              if (value === "custom") { setFiltersOpen(true); return; }
              const selected = periods.find((p) => p.value === value);
              const range = selected ? presetRange(selected.value) : { from: null, to: null };
              setFilters((f) => ({ ...f, from: range.from, to: range.to }));
            }}>
              <option value="all">{uiText("All time")}</option>
              {periods.map((p) => <option key={p.value} value={p.value}>{uiText(p.label ?? "")}</option>)}
              <option value="custom">{uiText("Custom dates")}</option>
            </select>
          </label>
          <button type="button" className="btn text-xs shrink-0" aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen((open) => !open)}>
            {filtersOpen ? uiText("Close filters") : uiText("Filters")}{filterCount > 0 ? ` (${filterCount})` : ""}
          </button>
            {active && (
              <button
                type="button"
                onClick={() => { setFilters(NO_SPENDING_FILTERS); setCustomDates(false); }}
                className="text-xs text-[var(--accent)]"
              >{uiText("Clear")}</button>
            )}
        </div>

        <div id={filtersId} hidden={!filtersOpen}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          <Select
            label={uiText("Category")}
            value={filters.categoryName ?? ""}
            onChange={(v) => set("categoryName", pick(v))}
            options={options.categories}
          />
          <Select
            label={uiText("Subcategory")}
            value={filters.subcategoryName ?? ""}
            onChange={(v) => set("subcategoryName", pick(v))}
            options={options.subcategories}
          />
          <Select
            label={uiText("Merchant")}
            value={filters.merchant ?? ""}
            onChange={(v) => set("merchant", pick(v))}
            options={options.merchants}
          />
          <Select
            label={uiText("Account")}
            value={filters.accountName ?? ""}
            onChange={(v) => set("accountName", pick(v))}
            options={options.accounts}
          />
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">{uiText("From")}</span>
            <input
              type="date"
              className="input text-xs w-full"
              value={filters.from ?? ""}
              onChange={(e) => set("from", pick(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">{uiText("To")}</span>
            <input
              type="date"
              className="input text-xs w-full"
              value={filters.to ?? ""}
              onChange={(e) => set("to", pick(e.target.value))}
            />
          </label>
        </div>

        {(options.hasFixed || options.hasVariable) && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-[10px] text-[var(--muted)]">{uiText("Show")}</span>
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
                {c === null ? uiText("everything") : c === "fixed" ? uiText("committed costs") : uiText("what you chose")}
              </button>
            ))}
          </div>
        )}
        </div>

        {describing !== null && (
          <p className="text-xs mt-3" style={{ color: "var(--accent)" }}>{uiText("Every figure below is ")}{describing} — {filtered.length}{uiText(" of ")}{rows.length}{uiText(" transactions.")}</p>
        )}

        {active && filtered.length === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">{uiText("Nothing matches that combination. Each filter has transactions of its own; they just have none in common.")}</p>
        )}

        {/* Rows, but none of them spending — a month of only income and
            transfers. The charts are empty and that is the reason. */}
        {filtered.length > 0 && view.totals.spent === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {uiText(filtered.length === 1 ? "{count} transaction" : "{count} transactions", { count: filtered.length })}{uiText(", none of them spending — income and transfers between your own accounts do not appear in the charts below.")}</p>
        )}

        {unconverted.length > 0 && (
          <p className="text-xs mt-3" style={{ color: "var(--amber)" }}>{uiText("No exchange rate for ")}{unconverted.join(", ")}{uiText(". Those transactions are left out of every figure here rather than counted as ")}{currency}.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={uiText("Spent")} value={view.totals.spent} currency={currency} tone="var(--red)" />
        <Tile label={uiText("Received")} value={view.totals.income} currency={currency} tone="var(--green)" />
        <Tile
          label={uiText("Net")}
          value={view.totals.net}
          currency={currency}
          tone={view.totals.net >= 0 ? "var(--green)" : "var(--red)"}
        />
        <div className="card p-3">
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{uiText("Committed share")}</div>
          {/* Null when nothing was spent: no spending means the question has no
              answer, and 0% would claim nothing was committed. */}
          <div className="text-xl font-semibold mt-1">
            {view.split.fixedShare === null ? "—" : `${view.split.fixedShare.toFixed(0)}%`}
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            {view.split.fixedShare === null
              ? uiText("nothing spent")
              : uiText("{0} was yours to choose", { "0": fmt(view.split.variable, currency) })}
          </div>
        </div>
      </div>

      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">{uiText("Where it went")}</div>
          <div className="flex gap-1">
            {(["category", "subcategory", "merchant", "account"] as const).map((d) => (
              <button
                key={uiText(d)}
                onClick={() => setDepth(d)}
                className="text-xs px-2 py-1 rounded border"
                style={{
                  borderColor: depth === d ? "var(--accent)" : "var(--border)",
                  color: depth === d ? "var(--accent)" : undefined,
                }}
              >
                {uiText(d)}
              </button>
            ))}
          </div>
        </div>

        {view.groups.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">{uiText("No spending in this slice.")}</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <DonutChart
              data={view.groups.slice(0, 8).map((g) => ({ name: g.name, value: g.spent }))}
              currency={currency}
            />
            <div className="overflow-auto max-h-72">
              <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap text-xs w-full">
                <thead>
                  <tr>
                    <th>{uiText(depth)}</th>
                    <th className="text-right">{uiText("Spent")}</th>
                    <th className="text-right">{uiText("Share")}</th>
                    <th className="text-right">{uiText("Count")}</th>
                    <th className="text-right">{uiText("Largest")}</th>
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
                      <td><span translate="no">{g.name}</span></td>
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
              </ResponsiveTable></div>
            </div>
          </div>
        )}

        {view.totals.uncategorised > 0 && (
          <p className="text-xs mt-3" style={{ color: "var(--amber)" }}>
            <Money value={view.totals.uncategorised} currency={currency} />{uiText(" has no category on it. That is the pile worth naming first — everything else on this page gets sharper once it has.")}</p>
        )}
      </section>

      <section className="card p-4">
        <div className="text-sm font-medium mb-3">{uiText("Month by month")}</div>
        {view.months.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">{uiText("Nothing to plot.")}</p>
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
                <Bar dataKey="income" name={uiText("In")} fill="var(--green)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="spent" name={uiText("Out")} fill="var(--red)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="text-sm font-medium mb-1">{uiText("Which day it goes")}</div>
        <p className="text-xs text-[var(--muted)] mb-3">{uiText("Seven bars whatever the data — a quiet Tuesday is a measurement, and hiding it would make the week look busier than it is.")}</p>
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
        <p className="text-xs text-[var(--muted)]">{uiText("Amounts in another currency were converted at today's rate, so figures from earlier months are approximate.")}</p>
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
  const uiText = useText();
  return (
    <div className="card p-3">
      <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">{uiText(label ?? "")}</div>
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
  const uiText = useText();
  return (
    <label className="block">
      <span className="text-[10px] text-[var(--muted)] block mb-1">{uiText(label ?? "")}</span>
      <select
        className="input text-xs w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={options.length === 0}
      >
        <option value="">{uiText("All")}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
