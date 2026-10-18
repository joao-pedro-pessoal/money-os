"use client";

import { useText } from "@/components/useText";
import SymbolName, { useSymbolNames } from "@/components/SymbolName";
import MultiSelect from "./MultiSelect";
import SavedFilters from "./SavedFilters";
import { tagLabel } from "@/lib/portfolio/tags";
import ResponsiveTable from "@/components/ResponsiveTable";


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
  parseTradeFilters,
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
import MobileFold from "./MobileFold";
import { useMobileMode } from "./MobileMode";
import { Money } from "./PrivacyContext";
import type { TradeOpeningMatch } from "@/lib/trading/tradeMatches";

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
  const uiText = useText();
  const [filters, setFilters] = useState<TradeFilters>(NO_TRADE_FILTERS);
  const { phone } = useMobileMode();
  const [visibleCount, setVisibleCount] = useState(15);

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

  const names = useSymbolNames();
  const symbolText = (s: string) => (names[s] ? `${names[s]} (${s})` : s);
  const assetTypeText = (t: string) => tagLabel(t, "assetType") ?? t;
  const active = hasActiveTradeFilters(filters);
  const describing = describeTradeFilters(filters, symbolText, assetTypeText);
  const hidden = closedOnly.length - filtered.length;
  // The activity table is a result ledger. Rows without a realised result
  // (open buys, deposits and other movements) belong in the portfolio/activity
  // views, not beside completed trades where they add noise.
  const completedTrades = filtered.filter((row) => row.realizedPnl !== null);

  const set = <K extends keyof TradeFilters>(key: K, value: TradeFilters[K]) => {
    setVisibleCount(15);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  /** An empty date input means no bound, not a day called "". */
  const pick = (value: string) => (value === "" ? null : value);

  return (
    <div className="trade-history-view space-y-4">
      {phone && <div className="trade-history-summary card p-4">
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-xs text-[var(--muted)]">{uiText("Closed trades")}</div><div className="text-xl font-semibold">{stats.closedCount}</div></div>
          <div><div className="text-xs text-[var(--muted)]">{uiText("Realized P&L")}</div><div className={`text-xl font-semibold ${toneOf(stats.pnl.at(-1)?.realized ?? 0)}`}><Money value={stats.pnl.at(-1)?.realized ?? 0} currency={currency} /></div></div>
        </div>
        {approximate && <p className="text-xs text-[var(--muted)] mt-2">{uiText("Currency conversions use current rates; historical results are approximate.")}</p>}
        {unconvertible > 0 && <p className="text-xs text-[var(--muted)] mt-2">{unconvertible}{uiText(" events excluded: exchange rate unavailable.")}</p>}
        {stats.provenance.derived > 0 && <p className="text-xs text-[var(--muted)] mt-2">{stats.provenance.derived}{uiText(" results estimated using average cost.")}</p>}
        {active && <div className="mt-2 text-xs"><p>{describing}</p><button className="btn mt-2" onClick={() => { setFilters(NO_TRADE_FILTERS); setVisibleCount(15); }}>{uiText("Clear filters")}</button></div>}
      </div>}
      <div className="trade-history-filters">
      <MobileFold title={active ? "Filters (active)" : "Filters"} persistKey="trade-history-filters">
      <section className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">{uiText("Filter")}</div>
          {active && (
            <button
              onClick={() => { setFilters(NO_TRADE_FILTERS); setVisibleCount(15); }}
              className="text-xs text-[var(--accent)]"
            >{uiText("Clear (")}{uiText(hidden === 1 ? "{count} row" : "{count} rows", { count: hidden })}{uiText(" hidden)")}</button>
          )}
        </div>

        <div className="trade-filter-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          {/* Several values per field; fields combine. Nothing ticked is everything. */}
          <MultiSelect label={uiText("Instrument")} options={options.symbols} selected={filters.symbols} onChange={(v) => set("symbols", v)} render={symbolText} />
          <MultiSelect label={uiText("Type")} options={options.types} selected={filters.types} onChange={(v) => set("types", v)} />
          <MultiSelect label={uiText("Account")} options={options.accounts} selected={filters.accounts} onChange={(v) => set("accounts", v)} />
          <MultiSelect label={uiText("Playlist")} options={options.playlists} selected={filters.playlists} onChange={(v) => set("playlists", v)} noneLabel="No playlist" />
          <MultiSelect label={uiText("Asset type")} options={options.assetTypes} selected={filters.assetTypes} onChange={(v) => set("assetTypes", v)} render={assetTypeText} noneLabel="Unclassified" />
          <MultiSelect label={uiText("Tag")} options={options.tags} selected={filters.tags} onChange={(v) => set("tags", v)} noneLabel="No tag" />
          <MultiSelect label={uiText("Direction")} options={options.directions} selected={filters.directions} onChange={(v) => set("directions", v as Direction[])} />
          <label className="block">
            <span className="text-[10px] text-[var(--muted)] block mb-1">{uiText("From")}</span>
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
            <span className="text-[10px] text-[var(--muted)] block mb-1">{uiText("To")}</span>
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
        <div className="mt-3">
          <SavedFilters
            scope="trade-history"
            current={JSON.stringify(filters)}
            active={active}
            onApply={(config) => { setFilters(parseTradeFilters(config, options)); setVisibleCount(15); }}
          />
        </div>

        {describing !== null && (
          <p className="text-xs mt-3" style={{ color: "var(--accent)" }}>{uiText("Every figure below is ")}{describing} — {filtered.length}{uiText(" of ")}{rows.length}{uiText(" events.")}</p>
        )}

        {active && filtered.length === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">{uiText("Nothing matches that combination. Each filter has events of its own — they just have none in common. The charts below are empty because there is nothing to draw, not because anything went wrong.")}</p>
        )}

        {/* Rows, but nothing for the result charts to draw — and the two
            reasons are different. Found on the real history: two EUN3 events
            and both charts empty, which without this reads as a broken page.
            A result of nothing is not a result of zero. */}
        {filtered.length > 0 && stats.tradeCount === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {uiText(filtered.length === 1 ? "{count} event" : "{count} events", { count: filtered.length })}{uiText(", none of them a buy or a sell — dividends, interest and transfers have no trading result, so the charts below are empty. The table still lists them.")}</p>
        )}

        {filtered.length > 0 && stats.tradeCount > 0 && stats.closedCount === 0 && (
          <p className="text-xs text-[var(--muted)] mt-3">
            {uiText(stats.tradeCount === 1 ? "{count} trade" : "{count} trades", { count: stats.tradeCount })}{uiText(", none of which has closed a position yet — so there is no realised result to chart. What you hold is on the Investments page.")}</p>
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
                  ? uiText("{0} result{1} as the venue reported them, and ", { "0": stats.provenance.reported, "1": stats.provenance.reported === 1 ? "" : "s" })
                  : ""}
                <span style={{ color: "var(--amber)" }}>
                  {stats.provenance.derived}{uiText(" worked out here")}</span>{" "}{uiText("under average cost, because the venue publishes none. That is this app's figure, not the broker's, and the two will not agree exactly.")}{" "}
              </>
            )}
            {stats.provenance.conversions > 0 && (
              <>
                {uiText(stats.provenance.conversions === 1 ? "{count} currency conversion" : "{count} currency conversions", { count: stats.provenance.conversions })}{uiText(" left out of every figure — money changing shape between two currencies is a mechanic of holding a foreign asset, not a position with a result.")}</>
            )}
          </p>
        )}
      </section>
      </MobileFold>
      </div>

      {/* Calendar, evolution and result by kind of trade open first; every other
          panel below them starts minimized on a phone. */}
      <div className="trade-history-charts space-y-4">
      <TradePnlCalendar rows={filtered} currency={currency} />

      <TradeEvolutionChart pnl={stats.pnl} currency={currency} accounts={accountHistory} accountName={filters.accounts.length === 1 ? filters.accounts[0] : null}
        from={filters.from} to={filters.to} onAccount={name => set("accounts", name ? [name] : [])} />

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
      </div>

      <section className="trade-history-list card p-4">
        <h2 className="text-sm font-medium">
          {active ? uiText("Matching realised trades") : uiText("Individual realised trades")}
        </h2>
        {completedTrades.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-6 text-center">{uiText("No events match.")}</p>
        ) : phone ? (
          <div className="space-y-3 mt-3">
            <p className="text-xs text-[var(--muted)]">{uiText("Showing ")}{Math.min(visibleCount, completedTrades.length)}{uiText(" of ")}{completedTrades.length}{uiText(" trades")}</p>
            {completedTrades.slice(0, visibleCount).map(r => <article key={r.id} className="trade-phone-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="font-semibold break-words">{r.symbol ? <Link href={`/investments/asset/${encodeURIComponent(r.symbol)}`}><SymbolName symbol={r.symbol} /></Link> : uiText("Unknown asset")}</div><div className="text-xs text-[var(--muted)] break-words"><span translate="no">{r.accountName}</span></div></div>
                <div className="shrink-0 text-right"><div className={`font-semibold ${toneOf(r.realizedPnl!)}`}><Money value={r.realizedPnl!} currency={currency} /></div><div className="text-[10px] text-[var(--muted)]">{uiText("Realized P&L")}</div></div>
              </div>
              <div className="text-xs text-[var(--muted)] mt-2">{r.date.slice(0, 10)} · {r.type}</div>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-[var(--accent)] py-2">{uiText("Trade details")}</summary>
                <div className="space-y-3 pt-2 break-words">
                  <p>{uiText("Closed: ")}{r.date.replace("T", " ").replace("Z", " UTC")}</p>
                  <p><span translate="no">{r.description ?? uiText("No description")}</span></p>
                  <div className="grid grid-cols-2 gap-3"><div>{uiText("Quantity")}<br />{r.quantity ?? uiText("Unavailable")}</div><div>{uiText("Net amount")}<br /><Money value={r.amount} currency={currency} /></div></div>
                  <OpeningDetails match={matches.get(r.id)} />
                  <TradeRowTags id={r.id} classification={r.classification} playlists={playlists} />
                </div>
              </details>
            </article>)}
            {visibleCount < completedTrades.length && <button type="button" className="btn w-full" onClick={() => setVisibleCount(count => count + 15)}>{uiText("Show more trades")}</button>}
          </div>
        ) : (
          <div className="overflow-auto max-h-[36rem] mt-3">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap text-xs">
              <thead>
                <tr>
                  <th>{uiText("Date")}</th>
                  <th>{uiText("Account")}</th>
                  <th>{uiText("Type")}</th>
                  <th>{uiText("Asset")}</th>
                  <th>{uiText("Description")}</th>
                  <th>{uiText("Tags")}</th>
                  <th className="text-right">{uiText("Quantity")}</th>
                  <th className="text-right">{uiText("Net amount")}</th>
                  <th className="text-right">{uiText("Realized P&L")}</th>
                </tr>
              </thead>
              <tbody>
                {completedTrades.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date.replace("T", " ").replace("Z", " UTC")}
                      <OpeningDetails match={matches.get(r.id)} />
                    </td>
                    <td><span translate="no">{r.accountName}</span></td>
                    <td>{r.type}</td>
                    <td>{r.symbol ? <Link href={`/investments/asset/${encodeURIComponent(r.symbol)}`} className="hover:underline"><SymbolName symbol={r.symbol} /></Link> : "—"}</td>
                    <td className="max-w-64 truncate"><span translate="no">{r.description ?? "—"}</span></td>
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
            </ResponsiveTable></div>
          </div>
        )}
      </section>
    </div>
  );
}

function OpeningDetails({ match }: { match?: TradeOpeningMatch }) {
  const uiText = useText();
  return <details>
    <summary className="cursor-pointer py-2">{uiText("Opening details")}</summary>
    <p>{match?.method === "broker-summary" ? uiText("Closed position reported by broker.")
      : match?.method === "broker-position" ? uiText("Matched within the broker position ID; quantities allocated in chronological order.")
      : uiText("FIFO estimate within the same account, connection and instrument.")}</p>
    {match?.brokerPositionId && <p>{uiText("Broker position ID: ")}{match.brokerPositionId}</p>}
    {match?.openedAt && <p>{uiText("Position created: ")}{match.openedAt}</p>}
    {match?.openings.map(o => <div key={o.id}>{o.date} · {o.quantity}{uiText(" units")}</div>)}
    {match?.method === "broker-summary"
      ? <p>{uiText("Individual opening fills are not supplied in this summary.")}{!match.openedAt && " Position creation time unavailable."}</p>
      : (!match || match.unmatched > 1e-8) && <p>{uiText("Opening history incomplete or unavailable.")}</p>}
  </details>;
}

function toneOf(amount: number): string {
  return amount > 0
    ? "text-[var(--green)]"
    : amount < 0
      ? "text-[var(--red)]"
      : "text-[var(--accent)]";
}

