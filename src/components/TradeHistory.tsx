"use client";

import { useMemo, useState } from "react";
import TradeAnalysis from "./TradeAnalysis";
import TradeEvolutionChart from "./TradeEvolutionChart";
import type { AccountEvolution } from "@/lib/trading/accountEvolution";
import TradePnlCalendar from "./TradePnlCalendar";
import {
  applyTradeFilters,
  hasActiveTradeFilters,
  describeTradeFilters,
  NO_TRADE_FILTERS,
  type TradeFilters,
  type TradeFilterOptions,
  type TradeHistoryRow,
  groupValuesOf,
  type TradeGrouping,
} from "@/lib/trading/filter";
import {
  cumulativePnl,
  bySymbol,
  byDirection,
  byMonth,
  byHour,
  byTag,
  taggedTotals,
  averageSize,
  holdingSummary,
  isInstrumentTrade,
  type Direction,
} from "@/lib/trading/stats";
import { realisedProvenance, type Derivable } from "@/lib/trading/realised";
import Link from "next/link";
import { isRealisedTrade, matchTradeOpenings } from "@/lib/trading/tradeMatches";

import TradeRowTags from "./TradeRowTags";

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
  playlists,
  accountHistory = [],
  options,
  currency,
  approximate,
  unconvertible,
}: {
  rows: (TradeHistoryRow & Derivable)[];
  accountHistory?: AccountEvolution[];
  playlists: { id: string; name: string }[];
  options: TradeFilterOptions;
  currency: string;
  approximate: boolean;
  unconvertible: number;
}) {
  const [filters, setFilters] = useState<TradeFilters>(NO_TRADE_FILTERS);

  // The filter is generic over the row shape, so the derived-result flag each
  // row carries survives into every figure below without a cast.
  /**
   * Everything on this page describes closed positions.
   *
   * An instrument you have only ever bought has produced no result, so it is a
   * holding rather than a trade history entry — it belongs on Investments. Cut
   * here, before the filters, so both tables and every figure derive from the
   * same array; narrowing one and not the others is the failure this page's
   * whole design avoids.
   */
  const closedOnly = useMemo(() => rows.filter(isRealisedTrade), [rows]);
  const matches = useMemo(() => matchTradeOpenings(rows), [rows]);

  const filtered = useMemo(
    () => applyTradeFilters(closedOnly, filters),
    [closedOnly, filters]
  );

  /** Which axis the "result by" panel groups on. */
  const [grouping, setGrouping] = useState<TradeGrouping>("riskLevel");

  /** Every figure, recomputed against what is left. */
  const stats = useMemo(() => {
    const periods = filtered.flatMap((row) => {
      const match = matches.get(row.id);
      if (!match) return [];
      const openedAt = match.method === "broker-summary" ? match.openedAt
        : match.unmatched <= 1e-8 ? match.openings[0]?.date : null;
      if (!openedAt) return [];
      return [{ symbol: row.symbol!, openedAt, closedAt: row.date, hours: (Date.parse(row.date) - Date.parse(openedAt)) / 3600000, realizedPnl: row.realizedPnl! }];
    });
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
  }, [filtered, matches]);

  /**
   * Result by whichever axis is selected, computed apart from `stats` so
   * switching the axis does not recompute every chart on the page.
   *
   * The accessor lives here rather than inside `byTag` because a classification
   * is this app's data and `stats.ts` describes trades — the same separation
   * that keeps the pure layer free of anything only this screen knows.
   */
  const grouped = useMemo(() => {
    const values = (row: TradeHistoryRow) => groupValuesOf(row, grouping);
    return {
      rows: byTag(filtered, (row) => values(row as TradeHistoryRow)),
      coverage: taggedTotals(filtered, (row) => values(row as TradeHistoryRow)),
    };
  }, [filtered, grouping]);

  const active = hasActiveTradeFilters(filters);
  const describing = describeTradeFilters(filters);
  const hidden = closedOnly.length - filtered.length;
  // The activity table is a result ledger. Rows without a realised result
  // (open buys, deposits and other movements) belong in the portfolio/activity
  // views, not beside completed trades where they add noise.
  const completedTrades = filtered.filter((row) => row.realizedPnl !== null);

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
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
            label="Tag"
            value={filters.tag ?? ""}
            onChange={(v) => set("tag", pick(v))}
            options={options.tags}
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

      <TradeEvolutionChart pnl={stats.pnl} currency={currency} accounts={accountHistory} accountName={filters.accountName}
        from={filters.from} to={filters.to} onAccount={name => set("accountName", name)} />

      <TradePnlCalendar rows={filtered} currency={currency} />

      <TradeAnalysis
        pnl={stats.pnl}
        symbols={stats.symbols}
        directions={stats.directions}
        months={stats.months}
        hours={stats.hours}
        holding={stats.holding}
        averageSize={stats.averageSize}
        grouped={grouped.rows}
        coverage={grouped.coverage}
        grouping={grouping}
        onGrouping={setGrouping}
        tradeCount={stats.tradeCount}
        closedCount={stats.closedCount}
        currency={currency}
        approximate={approximate}
        unconvertible={unconvertible}
      />

      <section className="card p-4">
        <h2 className="text-sm font-medium">
          {active ? "Matching realised trades" : "Individual realised trades"}
        </h2>
        {completedTrades.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-6 text-center">No events match.</p>
        ) : (
          <div className="overflow-auto max-h-[36rem] mt-3">
            <div className="table-scroll" role="region" aria-label="Scrollable data table" tabIndex={0}><table className="data-table whitespace-nowrap text-xs">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Description</th>
                  <th>Tags</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Net amount</th>
                  <th className="text-right">Realized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {completedTrades.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date.replace("T", " ").replace("Z", " UTC")}
                      <details><summary>Opening details</summary>
                        <p>{matches.get(r.id)?.method === "broker-summary" ? "Closed position reported by broker."
                          : matches.get(r.id)?.method === "broker-position" ? "Matched within the broker position ID; quantities allocated in chronological order."
                          : "FIFO estimate within the same account, connection and instrument."}</p>
                        {matches.get(r.id)?.brokerPositionId && <p>Broker position ID: {matches.get(r.id)!.brokerPositionId}</p>}
                        {matches.get(r.id)?.openedAt && <p>Position created: {matches.get(r.id)!.openedAt}</p>}
                        {matches.get(r.id)?.openings.map(o => <div key={o.id}>{o.date} ? {o.quantity} units</div>)}
                        {matches.get(r.id)?.method === "broker-summary"
                          ? <p>Individual opening fills are not supplied in this summary.{!matches.get(r.id)?.openedAt && " Position creation time unavailable."}</p>
                          : (!matches.get(r.id) || (matches.get(r.id)?.unmatched ?? 0) > 1e-8) && <p>Opening history incomplete or unavailable.</p>}
                      </details>
                    </td>
                    <td>{r.accountName}</td>
                    <td>{r.type}</td>
                    <td>{r.symbol ? <Link href={`/investments/asset/${encodeURIComponent(r.symbol)}`} className="hover:underline">{r.symbol}</Link> : "—"}</td>
                    <td className="max-w-64 truncate">{r.description ?? "—"}</td>
                    <td><TradeRowTags id={r.id} classification={r.classification} playlists={playlists} /></td>
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
            </table></div>
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
