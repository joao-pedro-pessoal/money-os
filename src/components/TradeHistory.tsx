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
  pairRealisedWithHeld,
  unmatchedOpen,
  type HeldPosition,
} from "@/lib/trading/holdingMatch";
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
import { setActivityTags } from "@/actions/investmentActivity";

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
  held,
  currency,
  approximate,
  unconvertible,
}: {
  rows: (TradeHistoryRow & Derivable)[];
  options: TradeFilterOptions;
  /** What is still held, for pairing a booked result with an open one. */
  held: HeldPosition[];
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

  /**
   * The booked result beside the one still riding, per instrument.
   *
   * Recomputed against the filtered rows like everything else, so narrowing to
   * one instrument narrows both halves of its result together. What is held
   * does not move with the filter; what was traded does.
   *
   * Realised comes from `stats.symbols` rather than being summed again — there
   * is one definition of a realised result and this does not become a second.
   */
  const instruments = useMemo(
    () =>
      pairRealisedWithHeld(
        filtered,
        held,
        new Map(stats.symbols.map((s) => [s.symbol, s.realized]))
      ),
    [filtered, held, stats.symbols]
  );
  const unmatched = useMemo(() => unmatchedOpen(instruments), [instruments]);

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

      {instruments.length > 0 && (
        <section className="card p-4">
          <div className="text-sm font-medium">Result by instrument</div>
          <p className="text-xs text-[var(--muted)] mt-1 mb-3">
            What closing produced, beside what is still riding on what you hold. Only the first
            is money you have.
          </p>

          <div className="overflow-auto max-h-96">
            <table className="data-table whitespace-nowrap text-xs w-full">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="text-right">Realised</th>
                  <th className="text-right">Unrealised</th>
                  <th className="text-right">Still held</th>
                  <th className="text-right">Units open</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((i) => (
                  <tr
                    key={i.symbol}
                    className="cursor-pointer"
                    onClick={() => set("symbol", i.symbol)}
                  >
                    <td>{i.symbol}</td>
                    <td className={`text-right ${toneOf(i.realised)}`}>
                      {i.realised.toFixed(2)} {currency}
                    </td>
                    {/* A dash, never 0,00. A closed position has no unrealised
                        result and an unmatched one has an unknown result, and
                        neither is a result of zero. */}
                    <td
                      className={`text-right ${
                        i.unrealised === null ? "text-[var(--muted)]" : toneOf(i.unrealised)
                      }`}
                    >
                      {i.unrealised === null
                        ? i.missing === "closed"
                          ? "closed"
                          : "—"
                        : `${i.unrealised.toFixed(2)} ${currency}`}
                    </td>
                    <td className="text-right text-[var(--muted)]">
                      {i.value === null ? "—" : `${i.value.toFixed(2)} ${currency}`}
                    </td>
                    <td className="text-right text-[var(--muted)]">
                      {i.netQuantity === 0 ? "—" : i.netQuantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* The gap that would otherwise be a blank cell reading as "nothing
              gained". These are instruments the trades say are still open and
              no holding could be matched to. */}
          {unmatched.length > 0 && (
            <p className="text-xs mt-3" style={{ color: "var(--amber)" }}>
              {unmatched.length} instrument{unmatched.length === 1 ? "" : "s"} still open by these
              trades could not be matched to a holding: {unmatched.join(", ")}. No unrealised
              figure is shown for them — that is missing, not zero.
            </p>
          )}
        </section>
      )}

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
                  <th>Tags</th>
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
                    <td>
                      <TagCell
                        id={r.id}
                        tags={r.tags}
                        known={options.tags}
                        onPick={(tag) => set("tag", tag)}
                      />
                    </td>
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

/**
 * The labels on one event, shown and edited in place.
 *
 * Editing is a whole set rather than add-one/remove-one: the row sends what it
 * should end up with, so a half-applied change cannot leave a label behind
 * that nobody asked for.
 *
 * The page is not re-fetched on save. `revalidatePath` in the action refreshes
 * it on the next navigation, and until then this shows what was sent — which is
 * what was stored, because the action either succeeds or throws.
 */
function TagCell({
  id,
  tags,
  known,
  onPick,
}: {
  id: string;
  tags: string[];
  known: readonly string[];
  onPick: (tag: string) => void;
}) {
  const [current, setCurrent] = useState(tags);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(next: string[]) {
    setBusy(true);
    setFailed(false);
    const previous = current;
    // Shown immediately, and put back if the write refuses. A label that looks
    // saved and is not is worse than one that visibly failed.
    setCurrent(next);
    try {
      await setActivityTags(id, next);
    } catch {
      setCurrent(previous);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-1 flex-wrap">
        {current.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            className="badge text-[10px]"
            title={`Show only rows tagged "${t}"`}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-[var(--accent)]"
        >
          {current.length === 0 ? "tag" : "edit"}
        </button>
        {failed && <span className="text-[10px] text-[var(--red)]">not saved</span>}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 flex-wrap">
      {current.map((t) => (
        <button
          key={t}
          disabled={busy}
          onClick={() => save(current.filter((x) => x !== t))}
          className="badge text-[10px]"
          title="Remove"
        >
          {t} ×
        </button>
      ))}
      <input
        list="trade-tag-names"
        className="input input-narrow text-[10px]"
        style={{ width: 110 }}
        placeholder="add…"
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const name = draft.trim();
          // Case-insensitive, or "Mistake" and "mistake" become two piles of
          // one idea — the same rule the action applies when it stores them.
          if (name === "" || current.some((t) => t.toLowerCase() === name.toLowerCase())) return;
          setDraft("");
          void save([...current, name]);
        }}
      />
      <datalist id="trade-tag-names">
        {known.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <button onClick={() => setEditing(false)} className="text-[10px] text-[var(--muted)]">
        done
      </button>
    </span>
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
