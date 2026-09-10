/**
 * Rebuilding what you hold from what you did.
 *
 * A broker statement records transactions, not holdings. Trade Republic
 * publishes no API, so the statement is all there is — and buys minus sells per
 * instrument *is* the position, exactly, to the share. Nothing is estimated
 * here. The only thing the statement cannot supply is today's price, which is
 * a separate module (`quotes.ts`) for a reason: quantity is fact, price is a
 * dependency, and mixing them would hide which half is trustworthy.
 *
 * Two things in here are deliberately loud rather than convenient:
 *
 *  - **The cost-basis method is named, never defaulted silently.** Average cost
 *    and FIFO give different realised P&L on the same transactions, both
 *    legitimately. A number that doesn't say which method produced it can't be
 *    checked against anything, including the tax return.
 *
 *  - **Realised P&L computed here belongs to this app, not to the broker.**
 *    Trading 212 publishes its own figure and the connector reports that one
 *    instead of deriving anything. Trade Republic publishes none, so computing
 *    it is the only option — but it is flagged as ours so the two are never
 *    presented as the same kind of claim.
 *
 * Pure — no DB, no I/O.
 */

import type { BrokerEvent } from "../csv/broker";
import { round2 } from "../accounting";

/**
 * How the cost of a sold share is decided.
 *
 * Not an implementation detail. On a position built over several purchases at
 * different prices, these disagree — and a portfolio that silently switched
 * between them would report a different profit for the same history.
 */
export const COST_BASIS_METHODS = [
  {
    value: "average",
    label: "Average cost",
    description: "Every share costs the same: total spent divided by shares held.",
  },
  {
    value: "fifo",
    label: "First in, first out",
    description: "The oldest shares are sold first. Usual for tax in most of Europe.",
  },
] as const;

export type CostBasisMethod = (typeof COST_BASIS_METHODS)[number]["value"];

/** A purchase still (at least partly) held, for FIFO. */
interface Lot {
  quantity: number;
  /** Cost of one share, fees included. */
  unitCost: number;
  boughtOn: Date;
}

export interface ReconstructedHolding {
  /**
   * What identifies the instrument.
   *
   * ISIN when the statement gives one, because a symbol is not unique across
   * exchanges — `IWDA` on two venues is one instrument, and two different
   * companies can share a ticker in different countries.
   */
  key: string;
  isin: string | null;
  symbol: string | null;
  /** Shares held now. Buys minus sells; never negative. */
  quantity: number;
  /** What the shares still held cost, fees included. */
  costBasis: number;
  /** costBasis / quantity. Null when nothing is held. */
  averageCost: number | null;
  /**
   * Profit on shares already sold, by the chosen method.
   *
   * This app's calculation, not the broker's. See the module note.
   */
  realizedPnl: number;
  /** Dividends and interest attributed to this instrument. */
  incomeReceived: number;
  /** Fees attributable to this instrument's trades. */
  feesPaid: number;
  firstBought: Date | null;
  lastTraded: Date | null;
  /** Rows that mentioned this instrument, for tracing a surprising number. */
  events: number;
  /**
   * True when the statement can't fully account for this holding — see
   * `reasons`. The quantity is then a floor, not a fact, and must not be
   * presented as one.
   */
  incomplete: boolean;
  reasons: string[];
}

export interface ReconstructionResult {
  method: CostBasisMethod;
  holdings: ReconstructedHolding[];
  /** Instruments whose quantity is trustworthy. */
  complete: ReconstructedHolding[];
  /** Instruments the statement can't fully explain. */
  incomplete: ReconstructedHolding[];
  /** Total cost of everything still held. Not its value — no prices here. */
  totalCostBasis: number;
  /** Realised profit across all instruments, this app's calculation. */
  totalRealizedPnl: number;
  /** The last transaction in the statement: how current this can possibly be. */
  lastEventDate: Date | null;
  /**
   * Always true for this module's output. Present so a caller has to
   * acknowledge it rather than discover it in a code review.
   */
  realizedPnlIsComputed: true;
}

/** ISIN if there is one, else the symbol. Uppercased; never an empty string. */
export function instrumentKey(e: {
  isin?: string | null;
  symbol?: string | null;
}): string | null {
  const isin = (e.isin ?? "").trim().toUpperCase();
  if (isin !== "") return isin;
  const symbol = (e.symbol ?? "").trim().toUpperCase();
  return symbol === "" ? null : symbol;
}

interface Working {
  key: string;
  isin: string | null;
  symbol: string | null;
  quantity: number;
  costBasis: number;
  realizedPnl: number;
  incomeReceived: number;
  feesPaid: number;
  lots: Lot[];
  firstBought: Date | null;
  lastTraded: Date | null;
  events: number;
  reasons: Set<string>;
}

/**
 * Holdings, from the statement alone.
 *
 * Events arrive in any order and are sorted here, because cost basis is
 * path-dependent: FIFO on shuffled rows would sell lots that hadn't been bought
 * yet, and average cost would divide by the wrong running quantity.
 */
export function reconstructHoldings(
  events: readonly (BrokerEvent & { isin?: string | null })[],
  method: CostBasisMethod = "average"
): ReconstructionResult {
  const ordered = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  const byKey = new Map<string, Working>();

  const workingFor = (e: (typeof ordered)[number], key: string): Working => {
    const existing = byKey.get(key);
    if (existing) {
      // A later row may carry an ISIN where an earlier one didn't, or vice
      // versa. Keep whichever identifiers we've seen.
      if (existing.isin === null && e.isin) existing.isin = e.isin.trim().toUpperCase();
      if (existing.symbol === null && e.symbol) existing.symbol = e.symbol.trim();
      return existing;
    }
    const fresh: Working = {
      key,
      isin: e.isin ? e.isin.trim().toUpperCase() : null,
      symbol: e.symbol ? e.symbol.trim() : null,
      quantity: 0,
      costBasis: 0,
      realizedPnl: 0,
      incomeReceived: 0,
      feesPaid: 0,
      lots: [],
      firstBought: null,
      lastTraded: null,
      events: 0,
      reasons: new Set<string>(),
    };
    byKey.set(key, fresh);
    return fresh;
  };

  for (const e of ordered) {
    const key = instrumentKey(e);
    // Deposits, withdrawals and cash interest have no instrument. They matter
    // for contributions, which `summariseCashFlows` already covers.
    if (key === null) continue;

    const w = workingFor(e, key);
    w.events += 1;

    switch (e.kind) {
      case "BUY": {
        w.lastTraded = e.date;
        if (e.quantity === null || e.quantity <= 0) {
          w.reasons.add("A purchase row didn't say how many shares, so the quantity held is a floor rather than a total.");
          break;
        }
        // Fees are part of what the shares cost you. Stated here because the
        // alternative — cost excluding fees — is also defensible, and someone
        // comparing this against a tax figure needs to know which was used.
        const cost = Math.abs(e.amount) + (e.fees ?? 0);
        w.quantity += e.quantity;
        w.costBasis += cost;
        w.feesPaid += e.fees ?? 0;
        w.lots.push({ quantity: e.quantity, unitCost: cost / e.quantity, boughtOn: e.date });
        if (w.firstBought === null) w.firstBought = e.date;
        break;
      }

      case "SELL": {
        w.lastTraded = e.date;
        if (e.quantity === null || e.quantity <= 0) {
          w.reasons.add("A sale row didn't say how many shares, so the quantity held can't be trusted.");
          break;
        }
        const proceeds = Math.abs(e.amount) - (e.fees ?? 0);
        w.feesPaid += e.fees ?? 0;

        // Selling more than the statement records buying is not a data error —
        // it's proof the export doesn't reach back to the account's start. The
        // sale is honoured, the shortfall is reported, and nothing goes
        // negative: a holding of −3 shares would poison every total downstream.
        const sellable = Math.min(e.quantity, w.quantity);
        if (sellable < e.quantity - 1e-9) {
          w.reasons.add("More shares were sold than the statement records buying — the history starts partway through.");
        }

        // Read the average before the sale: dividing after the quantity has
        // dropped would price the sold shares at the wrong average.
        const unitAverage = w.quantity > 0 ? w.costBasis / w.quantity : 0;
        // Lots are consumed under both methods so `lots` always mirrors
        // `quantity`. Only FIFO uses what they cost.
        const fifoCost = consumeLots(w.lots, sellable);
        const costOut = method === "fifo" ? fifoCost : unitAverage * sellable;

        // Proceeds are for the whole sale; cost only covers the part we can
        // account for. Scaling keeps the two comparable instead of booking the
        // unexplained shares as pure profit.
        const accountedProceeds =
          e.quantity > 0 ? proceeds * (sellable / e.quantity) : proceeds;

        w.quantity -= sellable;
        w.costBasis = Math.max(0, w.costBasis - costOut);
        w.realizedPnl += accountedProceeds - costOut;
        break;
      }

      case "DIVIDEND":
      case "INTEREST":
        w.incomeReceived += e.amount;
        w.feesPaid += e.fees ?? 0;
        break;

      case "FEE":
        w.feesPaid += Math.abs(e.amount) + (e.fees ?? 0);
        break;

      // Cash movements that happen to name an instrument change nothing here.
      case "DEPOSIT":
      case "WITHDRAWAL":
        break;
    }
  }

  const holdings = [...byKey.values()]
    // An instrument that only ever paid a dividend was never held according to
    // this file. Reporting it as a zero holding would clutter the list with
    // rows that aren't positions.
    .filter((w) => w.quantity > 1e-9 || w.realizedPnl !== 0 || w.reasons.size > 0)
    .map(finalise)
    .sort((a, b) => b.costBasis - a.costBasis || a.key.localeCompare(b.key));

  const dates = ordered.map((e) => e.date.getTime());

  return {
    method,
    holdings,
    complete: holdings.filter((h) => !h.incomplete),
    incomplete: holdings.filter((h) => h.incomplete),
    totalCostBasis: round2(holdings.reduce((s, h) => s + h.costBasis, 0)),
    totalRealizedPnl: round2(holdings.reduce((s, h) => s + h.realizedPnl, 0)),
    lastEventDate: dates.length > 0 ? new Date(Math.max(...dates)) : null,
    realizedPnlIsComputed: true,
  };
}

/**
 * Takes `quantity` out of the oldest lots and returns what it cost.
 *
 * Mutates `lots`, which is why it's private to this module: the caller's copy
 * is working state, not anything a consumer sees.
 */
function consumeLots(lots: Lot[], quantity: number): number {
  let remaining = quantity;
  let cost = 0;

  while (remaining > 1e-9 && lots.length > 0) {
    const lot = lots[0];
    const take = Math.min(lot.quantity, remaining);
    cost += take * lot.unitCost;
    lot.quantity -= take;
    remaining -= take;
    if (lot.quantity <= 1e-9) lots.shift();
  }

  return cost;
}

function finalise(w: Working): ReconstructedHolding {
  // Floating-point residue: selling everything can leave 1e-15 shares, and
  // "0.000000000000001 shares of IWDA" is not something to show anyone.
  const quantity = Math.abs(w.quantity) < 1e-9 ? 0 : w.quantity;
  const costBasis = quantity === 0 ? 0 : round2(w.costBasis);

  return {
    key: w.key,
    isin: w.isin,
    symbol: w.symbol,
    quantity,
    costBasis,
    averageCost: quantity > 0 ? costBasis / quantity : null,
    realizedPnl: round2(w.realizedPnl),
    incomeReceived: round2(w.incomeReceived),
    feesPaid: round2(w.feesPaid),
    firstBought: w.firstBought,
    lastTraded: w.lastTraded,
    events: w.events,
    incomplete: w.reasons.size > 0,
    reasons: [...w.reasons],
  };
}

export interface GainAgainstCost {
  /** What the account is worth now, as declared. */
  value: number;
  /** What the shares still held cost, from the statement. */
  cost: number;
  /** Value minus cost. Profit you have on paper and haven't taken. */
  unrealized: number;
  unrealizedPercent: number | null;
  /**
   * Always true here, and the reason this exists as its own shape.
   *
   * The total is exact; which instrument earned it is not knowable from these
   * two numbers, and splitting it pro rata would put a fabricated figure on
   * every row of a table whose other columns are facts.
   */
  perInstrumentUnknown: true;
}

/**
 * Unrealised profit, without a single market price.
 *
 * A statement records what you paid. An account that declares what it is worth
 * today supplies the other half, and the difference between them is the gain —
 * exactly, not approximately. No quote source, no staleness, nothing to go out
 * of date except the two numbers themselves.
 *
 * This is why the declared figure earns its keep. It looked like a crude
 * stand-in for real prices; it is actually the missing side of the subtraction.
 *
 * Returns null when the account hasn't said what it holds, because then there
 * is nothing to subtract from and a gain of zero would be a claim, not a gap.
 */
export function gainAgainstCost(
  declaredValue: number | null | undefined,
  costBasis: number
): GainAgainstCost | null {
  if (declaredValue === null || declaredValue === undefined) return null;

  const value = round2(declaredValue);
  const cost = round2(costBasis);
  const unrealized = round2(value - cost);

  return {
    value,
    cost,
    unrealized,
    // The same guard as everywhere else: a percentage of nothing is not zero,
    // it is meaningless. This is where "11248%" came from once.
    unrealizedPercent: cost > 0.01 ? round2((unrealized / cost) * 100) : null,
    perInstrumentUnknown: true,
  };
}

export interface PricingCrossCheck {
  /** What the account says it is worth. */
  declared: number;
  /** Market value of the positions that have a price. */
  pricedValue: number;
  /** Cost of the ones still without one — counted at cost, and said so. */
  unpricedCost: number;
  /** The two above together: the best estimate from the instruments. */
  estimate: number;
  difference: number;
  percent: number | null;
  /**
   * The estimate is far enough from the declared value to doubt a price.
   *
   * Not a rounding tolerance. A wrongly matched listing is a real instrument
   * with a real price — usually the same fund on another exchange, or a
   * different share class — so it produces a plausible figure that only shows
   * up as a total that disagrees with what the broker says.
   */
  suspicious: boolean;
  unpricedCount: number;
}

/**
 * Two ways of valuing the same account, compared.
 *
 * The account declares what it is worth. The instruments, once priced, add up
 * to something. Those are independent measurements of one quantity, and when
 * they disagree materially the fault is almost always a price rather than the
 * declaration — a listing matched to the wrong exchange or the wrong share
 * class returns a real number for the wrong thing.
 *
 * This is the check promised when per-instrument pricing was built and not
 * delivered with it. Without it, eleven wrong prices summing to a confident
 * total look exactly like eleven right ones.
 */
export function crossCheckPricing(input: {
  declaredValue: number | null | undefined;
  pricedValue: number;
  unpricedCost: number;
  unpricedCount: number;
}): PricingCrossCheck | null {
  if (input.declaredValue === null || input.declaredValue === undefined) return null;

  const declared = round2(input.declaredValue);
  const estimate = round2(input.pricedValue + input.unpricedCost);
  const difference = round2(estimate - declared);
  const percent = declared > 0.01 ? round2((difference / declared) * 100) : null;

  /**
   * Five percent, or ten units, whichever is larger.
   *
   * Small accounts move by a few euros between the day a balance was typed in
   * and the day a price was fetched, and flagging that would be noise. A fund
   * priced off the wrong exchange is out by far more.
   */
  const tolerance = Math.max(declared * 0.05, 10);

  return {
    declared,
    pricedValue: round2(input.pricedValue),
    unpricedCost: round2(input.unpricedCost),
    estimate,
    difference,
    percent,
    suspicious: Math.abs(difference) > tolerance,
    unpricedCount: input.unpricedCount,
  };
}

export interface QuantityDrift {
  key: string;
  symbol: string | null;
  /** What the statement says, after replaying every row. */
  reconstructed: number;
  /** What the platform reports right now. */
  reported: number;
  difference: number;
  /**
   * A drift big enough to matter. Absolute *and* relative, because 0.4 shares
   * is noise on 900 and the whole position on 0.5.
   */
  significant: boolean;
}

/**
 * Statement against live positions, where both exist.
 *
 * Not used to correct either one. It answers a different question: has anything
 * been bought since the last export? A live position larger than the replayed
 * statement is the signature of exactly that, and it's the cheapest honest
 * warning available that a reconstruction has gone out of date.
 */
export function compareWithReported(
  reconstructed: readonly ReconstructedHolding[],
  reported: readonly { key: string; symbol: string | null; quantity: number }[]
): QuantityDrift[] {
  const byKey = new Map(reconstructed.map((h) => [h.key, h]));
  const seen = new Set<string>();
  const drifts: QuantityDrift[] = [];

  for (const r of reported) {
    seen.add(r.key);
    const mine = byKey.get(r.key);
    drifts.push(makeDrift(r.key, r.symbol, mine?.quantity ?? 0, r.quantity));
  }

  for (const h of reconstructed) {
    if (!seen.has(h.key)) drifts.push(makeDrift(h.key, h.symbol, h.quantity, 0));
  }

  return drifts
    .filter((d) => d.significant)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

function makeDrift(
  key: string,
  symbol: string | null,
  reconstructed: number,
  reported: number
): QuantityDrift {
  const difference = reconstructed - reported;
  const scale = Math.max(Math.abs(reconstructed), Math.abs(reported), 1e-9);

  return {
    key,
    symbol,
    reconstructed,
    reported,
    difference,
    significant: Math.abs(difference) > 1e-6 && Math.abs(difference) / scale > 0.001,
  };
}
