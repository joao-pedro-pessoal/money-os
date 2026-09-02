"use client";

import { useMemo, useState } from "react";
import TradeAnalysis from "./TradeAnalysis";
import {
  applyTradeFilters,
  hasActiveTradeFilters,
  describeTradeFilters,
  NO_TRADE_FILTERS,
  type TradeFilters,
  type TradeFilterOptions,
  type TradeHistoryRow,
} from "@/lib/trading/filter";
import {
  cumulativePnl,
  bySymbol,
  byDirection,
  byMonth,
  byHour,
  averageSize,
  holdingPeriods,
  holdingSummary,
  isInstrumentTrade,
  type Direction,
} from "@/lib/trading/stats";
import { realisedProvenance, type Derivable } from "@/lib/trading/realised";

/**
 * The trade history, and every figure about it, over whatever slice is chosen.
 *
 * The filters narrow **one** array, and the charts, the tiles and the table all
 * derive from that array. Nothing is pre-computed on the server and then shown
 * beside a filtered table — which would put a figure describing the whole
 * account next to rows describing one instrument, and the reader has no way to
 * tell. Same rule as `PortfolioTable`, which drives its chart from the same
 * filtered set it lists.
 *
 * It works because `lib/trading/stats.ts` is pure functions over `TradeRow[]`:
 * filtering means calling them again with fewer rows. There is one
 * implementation of "win rate", and filtering does not create a second.
 */
export default function TradeHistory({
  rows,
  options,
  currency,
  approximate,
  unconvertible,
}: {
  rows: (TradeHistoryRow & Derivable)[];
  options: TradeFilterOptions;
  currency: string;
  approximate: boolean;
  unconvertible: number;
}) {
  const [filters, setFilters] = useState<TradeFilters>(NO_TRADE_FILTERS);

  // The filter is generic over the row shape, so the derived-result flag each
  // row carries survives into every figure below without a cast.
  const filtered = useMemo(() => applyTradeFilters(rows, filters), [rows, filters]);

  /** Every figure, recomputed against what is left. */
  const stats = useMemo(() => {
    const periods = holdingPeriods(filtered);
    // The narrow predicate: a currency conversion is a mechanic of holding a
    // foreign asset, not a position with a result. IBKR books them as buys and
    // sells of EUR.USD, and counting them made the page report 22 trades on an
    // account that had made about five.
    const trades = filtered.filter(isInstrumentTrade);
    return {
      pnl: cumulativePnl(filtered),
      symbols: bySymbol(filtered),
      directions: byDirection(filtered),
      months: byMonth(filtered),
      hours: byHour(filtered),
      averageSize: averageSize(filtered),
      holding: holdingSummary(periods),
      tradeCount: trades.length,
      closedCount: trades.filter((r) => r.realizedPnl !== null).length,
      /** Recomputed over the filtered set, like every other figure here. */
      provenance: realisedProvenance(filtered),
    };
  }, [filtered]);

  const active = hasActiveTradeFilters(filters);
  const describing = describeTradeFilters(filters);
  const hidden = rows.length - filtered.length;

  const set = <K extends keyof TradeFilters>(key: K, value: TradeFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  /** "" is the empty <select> option and means no filter, not a value of "". */
  const pick = (value: string) => (value === "" ? null : value);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">Filter</div>
          {active && (
            <button
              onClick={() => setFilters(NO_TRADE_FILTERS)}
              className="text-xs text-[var(--accent)]"
            >
              Clear ({hidden} row{hidden === 1 ? "" : "s"} hidden)
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <Select
            label="Instrument"
            value={filters.symbol ?? ""}
            onChange={(v) => set("symbol", pick(v))}
            options={options.symbols}
          />
          <Select
            label="Type"
            value={filters.type ?? ""}
            onChange={(v) => set("type", pick(v))}
            options={options.types}
          />
          <Select
            label="Account"
            value={filters.accountName ?? ""}
            onChange={(v) => set("accountName", pick(v))}
            options={options.accounts}
          />
          <Select
            label="Direction"
            value={filters.direction ?? ""}
            onChange={(v) => set("direction", pick(v) as Direction | null)}
            options={options.directions}
          />
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">From</span>
            <input
              type="date"
              className="input input-narrow text-xs w-full"
              value={filters.from ?? ""}
              min={options.earliest ?? undefined}
              max={options.latest ?? undefined}
              onChange={(e) => set("from", pick(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">To</span>
            <input
              type="date"
              className="input input-narrow text-xs w-full"
              value={filters.to ?? ""}
              min={options.earliest ?? undefined}
              max={options.latest ?? undefined}
              onChange={(e) => set("to", pick(e.target.value))}
            />
          </label>
        </div>

        {/* A figure computed over a subset has to say which subset, or it
            reads as the whole account's. */}
        {describing !== null && (
          <p className="text-xs mt-3" style={{ color: "var(--accent)" }}>
            Every figure below is {describing} — {filtered.length} of {rows.length} events.
          </p>
        )}

        {active && filtered.length === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            Nothing matches that combination. Each filter has events of its own — they just
            have none in common. The charts below are empty because there is nothing to draw,
            not because anything went wrong.
          </p>
        )}

        {/* Rows, but nothing for the result charts to draw — and the two
            reasons are different. Found on the real history: two EUN3 events
            and both charts empty, which without this reads as a broken page.
            A result of nothing is not a result of zero. */}
        {filtered.length > 0 && stats.tradeCount === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {filtered.length} event{filtered.length === 1 ? "" : "s"}, none of them a buy or a
            sell — dividends, interest and transfers have no trading result, so the charts
            below are empty. The table still lists them.
          </p>
        )}

        {filtered.length > 0 && stats.tradeCount > 0 && stats.closedCount === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {stats.tradeCount} trade{stats.tradeCount === 1 ? "" : "s"}, none of which has
            closed a position yet — so there is no realised result to chart. What you hold is
            on the Investments page.
          </p>
        )}

        {/* Where the results came from, and what was left out.
            A figure this app derived and one a broker published answer the
            same question by different methods and will not agree, so a total
            mixing them without saying so cannot be checked against anything. */}
        {(stats.provenance.derived > 0 || stats.provenance.conversions > 0) && (
          <p className="text-[10px] text-[var(--muted)] mt-3 leading-relaxed">
            {stats.provenance.derived > 0 && (
              <>
                {stats.provenance.reported > 0
                  ? `${stats.provenance.reported} result${stats.provenance.reported === 1 ? "" : "s"} as the venue reported them, and `
                  : ""}
                <span style={{ color: "var(--amber)" }}>
                  {stats.provenance.derived} worked out here
                </span>{" "}
                under average cost, because the venue publishes none. That is this app&apos;s
                figure, not the broker&apos;s, and the two will not agree exactly.{" "}
              </>
            )}
            {stats.provenance.conversions > 0 && (
              <>
                {stats.provenance.conversions} currency conversion
                {stats.provenance.conversions === 1 ? "" : "s"} left out of every figure —
                money changing shape between two currencies is a mechanic of holding a foreign
                asset, not a position with a result.
              </>
            )}
          </p>
        )}
      </section>

      <TradeAnalysis
        pnl={stats.pnl}
        symbols={stats.symbols}
        directions={stats.directions}
        months={stats.months}
        hours={stats.hours}
        holding={stats.holding}
        averageSize={stats.averageSize}
        tradeCount={stats.tradeCount}
        closedCount={stats.closedCount}
        currency={currency}
        approximate={approximate}
        unconvertible={unconvertible}
      />

      <section className="card p-4">
        <h2 className="text-sm font-medium">
          {active ? "Matching activity" : "All account activity"}
        </h2>
        {filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-6 text-center">No events match.</p>
        ) : (
          <div className="overflow-auto max-h-[36rem] mt-3">
            <table className="data-table whitespace-nowrap text-xs">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Description</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Net amount</th>
                  <th className="text-right">Realized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.date}-${r.symbol ?? ""}-${i}`}>
                    <td>{r.date.slice(0, 10)}</td>
                    <td>{r.accountName}</td>
                    <td>{r.type}</td>
                    <td>{r.symbol ?? "—"}</td>
                    <td className="max-w-64 truncate">{r.description ?? "—"}</td>
                    <td className="text-right">{r.quantity ?? "—"}</td>
                    <td className={`text-right ${toneOf(r.amount)}`}>
                      {r.amount.toFixed(2)} {currency}
                    </td>
                    {/* A dash, never 0,00: a trade that closed nothing has no
                        result, which is not the same as a result of zero. */}
                    <td
                      className={`text-right ${
                        r.realizedPnl === null ? "text-[var(--muted)]" : toneOf(r.realizedPnl)
                      }`}
                    >
                      {r.realizedPnl === null
                        ? "—"
                        : `${r.realizedPnl.toFixed(2)} ${currency}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function toneOf(amount: number): string {
  return amount > 0
    ? "text-[var(--green)]"
    : amount < 0
      ? "text-[var(--red)]"
      : "text-[var(--accent)]";
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
        // Nothing to choose between when the data has one value or none.
        disabled={options.length < 2}
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
