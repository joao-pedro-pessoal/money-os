/**
 * What the trade history says about how you trade.
 *
 * Four questions, each answered from the same rows: whether trading is making
 * money, which instruments it works on, how often you do it, and how long you
 * hold. Every one of them is a claim people act on, so the rules here are
 * stricter than the arithmetic strictly needs.
 *
 * **Everything arriving here is already in one currency.** These functions add
 * amounts, and a euro trade next to a dollar trade would produce a number in no
 * currency at all — the recurring bug this codebase has fixed nine times. The
 * action converts before calling in; the types below have no currency field so
 * that a caller cannot pass mixed rows without noticing.
 *
 * Pure: no DB, no fetch, no React.
 */

/** One movement, converted to the base currency. */
export interface TradeRow {
  /** ISO timestamp. */
  date: string;
  /** BUY | SELL | DIVIDEND | … — only trades are analysed here. */
  type: string;
  symbol: string | null;
  quantity: number | null;
  /** Net cash movement: negative on a buy, positive on a sale. */
  amount: number;
  /** The cost of doing the trade, never folded into `amount`. */
  fees: number | null;
  /** What the venue says this closed. Null when it closed nothing. */
  realizedPnl: number | null;
  /** The venue's own wording, e.g. "Close Long". */
  description: string | null;
}

import { isCurrencyCode } from "../fx";

const TRADE_TYPES = new Set(["BUY", "SELL"]);

/**
 * A buy or a sell, by type alone.
 *
 * **Not the right question for a statistic.** IBKR books a currency conversion
 * as a buy or a sell of `EUR.USD`, and on a live account those outnumbered
 * every real position — so use `isInstrumentTrade` from `./realised.ts`
 * anywhere a figure is being computed. This stays because the distinction
 * between "a trade row" and "a position worth measuring" is real, and the
 * narrower one is built on this.
 */
export function isTrade(row: TradeRow): boolean {
  return TRADE_TYPES.has(row.type.toUpperCase());
}

/**
 * True for a symbol that names one currency against another.
 *
 * Both halves must be currency codes, which is what makes this safe: `BRK.B`
 * splits into `BRK` and `B`, neither is a currency, and a real ticker with a
 * dot in it is left alone. Testing only for a dot would have swallowed it.
 */
export function isCurrencyConversion(symbol: string | null | undefined): boolean {
  if (typeof symbol !== "string") return false;
  const parts = symbol.trim().toUpperCase().split(/[./]/);
  if (parts.length !== 2) return false;
  return isCurrencyCode(parts[0]) && isCurrencyCode(parts[1]);
}

/**
 * A trade in an instrument — the only thing any figure below is about.
 *
 * Money changing shape between two currencies is a mechanic of holding a
 * foreign asset, not a decision with a result. On a live IBKR account those
 * conversions outnumbered every real position, and each of the six figures in
 * this file was counting them.
 */
export function isInstrumentTrade(row: TradeRow): boolean {
  return isTrade(row) && !isCurrencyConversion(row.symbol);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Calendar day of a timestamp, in UTC so a day is always the same length. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1. Am I winning or losing?
// ---------------------------------------------------------------------------

export interface PnlPoint {
  date: string;
  /** Running total of what the venue says trades closed for. */
  realized: number;
  /** Running total of what those trades cost in fees. */
  fees: number;
  /** realized − fees. The only one of the three you can spend. */
  net: number;
}

/**
 * Realised P&L and fees accumulated over time.
 *
 * Fees are tracked as their own line rather than quietly subtracted, because on
 * a small account they routinely exceed the trading result and that is the
 * single most useful thing this chart can show: -5.93 of realised P&L against
 * 6.18 of fees is not a near-breakeven quarter, it is a losing one, and only
 * the `net` line says so.
 *
 * One point per day on which something happened. Days with no trades are not
 * invented — a flat stretch on the chart is a stretch you did not trade, and
 * padding it would suggest activity that never occurred.
 */
export function cumulativePnl(rows: TradeRow[]): PnlPoint[] {
  const byDay = new Map<string, { realized: number; fees: number }>();

  for (const row of rows) {
    if (!isInstrumentTrade(row)) continue;
    const day = dayOf(row.date);
    const entry = byDay.get(day) ?? { realized: 0, fees: 0 };
    if (row.realizedPnl !== null) entry.realized += row.realizedPnl;
    if (row.fees !== null) entry.fees += row.fees;
    byDay.set(day, entry);
  }

  let realized = 0;
  let fees = 0;

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e]) => {
      realized += e.realized;
      fees += e.fees;
      return {
        date,
        realized: round2(realized),
        fees: round2(fees),
        net: round2(realized - fees),
      };
    });
}

// ---------------------------------------------------------------------------
// 2. What do I trade well?
// ---------------------------------------------------------------------------

export interface SymbolStats {
  symbol: string;
  /** Fills that closed something. An opening fill is not a result yet. */
  closedTrades: number;
  wins: number;
  losses: number;
  realized: number;
  fees: number;
  net: number;
  /** Share of closed trades that made money, or null with none to judge. */
  winRate: number | null;
}

/**
 * Result per instrument, ranked by what it actually left you.
 *
 * Ranked on `net` rather than `realized`: an instrument you trade often can win
 * on paper and lose after costs, and it is the second one that decides whether
 * to keep trading it.
 *
 * Only fills that closed something count as trades. Counting opens would double
 * every round trip and halve every win rate.
 */
export function bySymbol(rows: TradeRow[]): SymbolStats[] {
  const groups = new Map<string, SymbolStats>();

  for (const row of rows) {
    if (!isInstrumentTrade(row) || !row.symbol) continue;

    const stats =
      groups.get(row.symbol) ??
      {
        symbol: row.symbol,
        closedTrades: 0,
        wins: 0,
        losses: 0,
        realized: 0,
        fees: 0,
        net: 0,
        winRate: null,
      };

    // Fees are paid on opens too, so they accumulate on every fill.
    if (row.fees !== null) stats.fees += row.fees;

    if (row.realizedPnl !== null) {
      stats.closedTrades += 1;
      stats.realized += row.realizedPnl;
      if (row.realizedPnl > 0) stats.wins += 1;
      else if (row.realizedPnl < 0) stats.losses += 1;
    }

    groups.set(row.symbol, stats);
  }

  return [...groups.values()]
    .map((s) => ({
      ...s,
      realized: round2(s.realized),
      fees: round2(s.fees),
      net: round2(s.realized - s.fees),
      winRate: s.closedTrades === 0 ? null : round2((s.wins / s.closedTrades) * 100),
    }))
    .sort((a, b) => b.net - a.net);
}

export type Direction = "long" | "short" | "unknown";

/**
 * Which way a fill was betting, from the venue's own wording.
 *
 * Hyperliquid says "Close Long" or "Close Short"; an imported CSV says whatever
 * the broker wrote. Anything unrecognised is `unknown` rather than assumed
 * long — most positions are long, which is exactly what makes guessing here
 * look right while quietly hiding every short.
 */
export function directionOf(row: TradeRow): Direction {
  const text = (row.description ?? "").toLowerCase();
  if (text.includes("short")) return "short";
  if (text.includes("long")) return "long";
  return "unknown";
}

export interface DirectionStats {
  direction: Direction;
  closedTrades: number;
  wins: number;
  realized: number;
  net: number;
  winRate: number | null;
}

/** Result split by whether you were betting on a rise or a fall. */
export function byDirection(rows: TradeRow[]): DirectionStats[] {
  const groups = new Map<Direction, { trades: number; wins: number; realized: number; fees: number }>();

  for (const row of rows) {
    if (!isInstrumentTrade(row)) continue;
    const key = directionOf(row);
    const g = groups.get(key) ?? { trades: 0, wins: 0, realized: 0, fees: 0 };
    if (row.fees !== null) g.fees += row.fees;
    if (row.realizedPnl !== null) {
      g.trades += 1;
      g.realized += row.realizedPnl;
      if (row.realizedPnl > 0) g.wins += 1;
    }
    groups.set(key, g);
  }

  return [...groups.entries()]
    .map(([direction, g]) => ({
      direction,
      closedTrades: g.trades,
      wins: g.wins,
      realized: round2(g.realized),
      net: round2(g.realized - g.fees),
      winRate: g.trades === 0 ? null : round2((g.wins / g.trades) * 100),
    }))
    .filter((d) => d.closedTrades > 0)
    .sort((a, b) => b.net - a.net);
}

/** One closed trade, as it appears under the group it belongs to. */
export interface TagTrade {
  date: string;
  symbol: string | null;
  /** What the venue says this closed. Never null — only closed trades are here. */
  realized: number;
  fees: number | null;
  /** Realised minus what it cost to do, which is what was actually kept. */
  net: number;
  description: string | null;
}

export interface TagStats {
  tag: string;
  closedTrades: number;
  wins: number;
  realized: number;
  net: number;
  winRate: number | null;
  /** Best and worst single result carrying this tag. */
  best: number;
  worst: number;
  /**
   * The trades this group is made of, newest first.
   *
   * Carried on the group rather than looked up again when a row is opened, so
   * the detail cannot disagree with the total above it — these are the very
   * rows the total was summed from. Same rule as `performanceBy`'s members.
   */
  trades: TagTrade[];
}

/**
 * Result split by the labels you put on your own trades.
 *
 * The one grouping here that is not a fact about the trade. Symbol, direction,
 * month and hour are all read off the row; a tag is a claim you made about
 * *why* you took it — the setup, the thesis, the mistake — and it is the only
 * axis that can answer whether a way of trading works.
 *
 * **A trade with three tags is counted in all three.** These groups overlap by
 * design, so the columns do not sum to your total and must never be presented
 * as a breakdown of it: two tags on one winner would otherwise report the
 * profit twice. `taggedTotals` gives the honest denominator.
 *
 * An untagged trade appears in no group rather than under an "unset" heading.
 * Every other grouping here is exhaustive because the venue always supplies a
 * value; a tag is absent until you write one, and inventing a bucket for
 * "nothing said" would put most of your history in it and say nothing.
 */
export function byTag(rows: TradeRow[], tagsOf: (row: TradeRow) => readonly string[]): TagStats[] {
  const groups = new Map<
    string,
    {
      trades: number;
      wins: number;
      realized: number;
      fees: number;
      best: number;
      worst: number;
      rows: TagTrade[];
    }
  >();

  for (const row of rows) {
    if (!isInstrumentTrade(row)) continue;
    // Only a closed trade has a result to attribute to a label.
    if (row.realizedPnl === null) continue;

    for (const tag of new Set(tagsOf(row))) {
      const g = groups.get(tag) ?? {
        trades: 0,
        wins: 0,
        realized: 0,
        fees: 0,
        best: -Infinity,
        worst: Infinity,
        rows: [],
      };
      g.trades += 1;
      g.rows.push({
        date: row.date,
        symbol: row.symbol,
        realized: round2(row.realizedPnl),
        fees: row.fees,
        net: round2(row.realizedPnl - (row.fees ?? 0)),
        description: row.description,
      });
      g.realized += row.realizedPnl;
      if (row.fees !== null) g.fees += row.fees;
      if (row.realizedPnl > 0) g.wins += 1;
      g.best = Math.max(g.best, row.realizedPnl);
      g.worst = Math.min(g.worst, row.realizedPnl);
      groups.set(tag, g);
    }
  }

  return [...groups.entries()]
    .map(([tag, g]) => ({
      tag,
      closedTrades: g.trades,
      wins: g.wins,
      realized: round2(g.realized),
      net: round2(g.realized - g.fees),
      winRate: g.trades === 0 ? null : round2((g.wins / g.trades) * 100),
      best: round2(g.best),
      worst: round2(g.worst),
      // Newest first, so a run of losses reads as the run it was.
      trades: [...g.rows].sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => b.net - a.net);
}

export interface TaggedTotals {
  /** Closed trades carrying at least one tag. */
  tagged: number;
  /** Closed trades carrying none. */
  untagged: number;
  /** Realised across tagged trades, each counted once however many tags it has. */
  realized: number;
}

/**
 * How much of the history the tag table above actually covers.
 *
 * Needed because `byTag` overlaps: its columns cannot be added up, so without
 * this there is no honest way to say "these figures describe 40 of your 130
 * closed trades". Each trade is counted once here however many labels it
 * carries, which is what makes this the denominator and that a breakdown.
 */
export function taggedTotals(
  rows: TradeRow[],
  tagsOf: (row: TradeRow) => readonly string[]
): TaggedTotals {
  let tagged = 0;
  let untagged = 0;
  let realized = 0;

  for (const row of rows) {
    if (!isInstrumentTrade(row)) continue;
    if (row.realizedPnl === null) continue;

    if (tagsOf(row).length > 0) {
      tagged += 1;
      realized += row.realizedPnl;
    } else {
      untagged += 1;
    }
  }

  return { tagged, untagged, realized: round2(realized) };
}

// ---------------------------------------------------------------------------
// 3. How often, and when?
// ---------------------------------------------------------------------------

export interface CadencePoint {
  /** "YYYY-MM". */
  month: string;
  trades: number;
  /** Cash through the book, buys and sells alike. */
  volume: number;
  fees: number;
}

/** Trades per month, with what they moved and what they cost. */
export function byMonth(rows: TradeRow[]): CadencePoint[] {
  const groups = new Map<string, CadencePoint>();

  for (const row of rows) {
    if (!isInstrumentTrade(row)) continue;
    const month = row.date.slice(0, 7);
    const g = groups.get(month) ?? { month, trades: 0, volume: 0, fees: 0 };
    g.trades += 1;
    g.volume += Math.abs(row.amount);
    if (row.fees !== null) g.fees += row.fees;
    groups.set(month, g);
  }

  return [...groups.values()]
    .map((g) => ({ ...g, volume: round2(g.volume), fees: round2(g.fees) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export interface HourBucket {
  /** 0–23, in UTC. */
  hour: number;
  trades: number;
}

/**
 * When in the day you trade, in **UTC**.
 *
 * Deliberately not converted to a local zone: the rows come from venues in
 * different places and the app has no reliable answer for where you were when
 * you placed each one. A chart labelled with the wrong hours would be read as
 * fact, so it is labelled with the hours it actually has.
 */
export function byHour(rows: TradeRow[]): HourBucket[] {
  const counts = new Array<number>(24).fill(0);

  for (const row of rows) {
    if (!isInstrumentTrade(row)) continue;
    const hour = new Date(row.date).getUTCHours();
    if (Number.isFinite(hour)) counts[hour] += 1;
  }

  return counts.map((trades, hour) => ({ hour, trades }));
}

/** Typical size of a trade, which is what "am I overtrading" is really about. */
export function averageSize(rows: TradeRow[]): number | null {
  const trades = rows.filter(isTrade);
  if (trades.length === 0) return null;
  return round2(trades.reduce((s, r) => s + Math.abs(r.amount), 0) / trades.length);
}

// ---------------------------------------------------------------------------
// 4. How long do I hold?
// ---------------------------------------------------------------------------

export interface HoldingPeriod {
  symbol: string;
  openedAt: string;
  closedAt: string;
  hours: number;
  realizedPnl: number;
}

interface OpenLot {
  date: string;
  quantity: number;
}

/**
 * How long each closed trade was held, matched oldest-open-first.
 *
 * A closing fill carries a result and a time; the opening fill it answers has
 * to be found. Lots are consumed in the order they were opened, which is the
 * convention brokers use and the only one that gives a stable answer when a
 * position was built in pieces.
 *
 * A close with no matching open is skipped rather than dated from the first
 * row: the history goes back only as far as the venue's window, so a position
 * opened before it would otherwise report a holding period measured from an
 * arbitrary point — a plausible number with nothing behind it.
 */
export function holdingPeriods(rows: TradeRow[]): HoldingPeriod[] {
  const lots = new Map<string, OpenLot[]>();
  const periods: HoldingPeriod[] = [];

  const chronological = rows
    .filter((r) => isInstrumentTrade(r) && r.symbol)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const row of chronological) {
    const symbol = row.symbol!;
    const quantity = Math.abs(row.quantity ?? 0);
    if (quantity === 0) continue;

    const open = lots.get(symbol) ?? [];

    // A fill that closed nothing opened something.
    if (row.realizedPnl === null) {
      open.push({ date: row.date, quantity });
      lots.set(symbol, open);
      continue;
    }

    let remaining = quantity;
    let matchedAt: string | null = null;

    while (remaining > 0 && open.length > 0) {
      const lot = open[0];
      // The oldest lot dates the trade; a close spanning several lots is
      // reported from the first one it consumed.
      if (matchedAt === null) matchedAt = lot.date;

      if (lot.quantity > remaining) {
        lot.quantity -= remaining;
        remaining = 0;
      } else {
        remaining -= lot.quantity;
        open.shift();
      }
    }

    lots.set(symbol, open);
    if (matchedAt === null) continue;

    const hours = (Date.parse(row.date) - Date.parse(matchedAt)) / 3_600_000;
    if (!Number.isFinite(hours) || hours < 0) continue;

    periods.push({
      symbol,
      openedAt: matchedAt,
      closedAt: row.date,
      hours: Math.round(hours * 10) / 10,
      realizedPnl: round2(row.realizedPnl),
    });
  }

  return periods.sort((a, b) => b.closedAt.localeCompare(a.closedAt));
}

export interface HoldingSummary {
  /** Median rather than mean: one trade held for months would carry a mean. */
  medianHours: number | null;
  winnersMedianHours: number | null;
  losersMedianHours: number | null;
  count: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 10) / 10;
}

/**
 * How long winners are held against losers.
 *
 * The comparison is the point. Holding losers longer than winners is the
 * best-documented pattern in retail trading and it is invisible in a P&L
 * total — you can only see it by putting the two medians side by side.
 */
export function holdingSummary(periods: HoldingPeriod[]): HoldingSummary {
  return {
    medianHours: median(periods.map((p) => p.hours)),
    winnersMedianHours: median(periods.filter((p) => p.realizedPnl > 0).map((p) => p.hours)),
    losersMedianHours: median(periods.filter((p) => p.realizedPnl < 0).map((p) => p.hours)),
    count: periods.length,
  };
}
