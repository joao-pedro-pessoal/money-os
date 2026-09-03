/**
 * Portfolio analysis — pure aggregation math over holdings.
 * No DB, no I/O (same discipline as src/lib/accounting).
 *
 * Nothing here mutates or re-derives prices; it only groups and sums values
 * that were already computed by src/lib/portfolio/index.ts.
 */

import { marketValue, costBasis, unrealizedPnL, type HoldingLike } from "./index";
import { STABLE_ASSET_TYPES } from "./tags";

export interface AnalysisHolding extends HoldingLike {
  id: string;
  symbol: string;
  playlistId?: string | null;
  playlistName?: string | null;
  realizedPnl?: number | null;
  accountId?: string | null;
  accountName?: string | null;
  assetType?: string | null;
  riskLevel?: string | null;
  expectedReturn?: string | null;
  timeHorizon?: string | null;
  liquidity?: string | null;
  apr?: number | null;
  rewardsEarned?: number | null;
}

export interface Breakdown {
  key: string;
  value: number;
  percent: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Groups holdings by an arbitrary key and returns each group's market value
 * plus its share of the total. Holdings with no value for the key are grouped
 * under `unsetLabel` so nothing silently disappears from the totals.
 */
export function breakdownBy(
  holdings: AnalysisHolding[],
  key: (h: AnalysisHolding) => string | null | undefined,
  unsetLabel = "unset"
): Breakdown[] {
  const total = holdings.reduce((s, h) => s + marketValue(h), 0);
  const groups = new Map<string, number>();

  for (const h of holdings) {
    const k = key(h) ?? unsetLabel;
    groups.set(k, (groups.get(k) ?? 0) + marketValue(h));
  }

  return Array.from(groups.entries())
    .map(([k, value]) => ({
      key: k,
      value: round2(value),
      percent: total === 0 ? 0 : round2((value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Splits the portfolio into the part that is (near) capital-guaranteed —
 * cash and stablecoins — and the part exposed to market swings. This is what
 * lets Net Worth show a total with the floating portion in parentheses.
 */
export function stableVsFloating(holdings: AnalysisHolding[]): {
  stable: number;
  floating: number;
  floatingPercent: number;
} {
  let stable = 0;
  let floating = 0;

  for (const h of holdings) {
    if (h.assetType && STABLE_ASSET_TYPES.includes(h.assetType)) {
      stable += marketValue(h);
    } else {
      floating += marketValue(h);
    }
  }

  const total = stable + floating;
  return {
    stable: round2(stable),
    floating: round2(floating),
    floatingPercent: total === 0 ? 0 : round2((floating / total) * 100),
  };
}

/**
 * Projected annual income from yield-bearing positions, plus rewards already
 * received. `projectedAnnual` is forward-looking (APR x current value);
 * `rewardsEarned` is what actually landed so far — deliberately kept apart so
 * an estimate is never mistaken for realised income.
 */
export function stakingSummary(holdings: AnalysisHolding[]): {
  stakedValue: number;
  projectedAnnual: number;
  rewardsEarned: number;
  weightedApr: number;
} {
  let stakedValue = 0;
  let projectedAnnual = 0;
  let rewardsEarned = 0;

  for (const h of holdings) {
    rewardsEarned += h.rewardsEarned ?? 0;
    if (h.apr && h.apr > 0) {
      const value = marketValue(h);
      stakedValue += value;
      projectedAnnual += (value * h.apr) / 100;
    }
  }

  return {
    stakedValue: round2(stakedValue),
    projectedAnnual: round2(projectedAnnual),
    rewardsEarned: round2(rewardsEarned),
    weightedApr: stakedValue === 0 ? 0 : round2((projectedAnnual / stakedValue) * 100),
  };
}

/** Positions sorted by absolute P&L — the biggest winners and losers. */
export function topMovers(holdings: AnalysisHolding[], limit = 5) {
  const withPnL = holdings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    pnl: unrealizedPnL(h),
    value: marketValue(h),
    cost: costBasis(h),
  }));

  const winners = withPnL.filter((h) => h.pnl > 0).sort((a, b) => b.pnl - a.pnl).slice(0, limit);
  const losers = withPnL.filter((h) => h.pnl < 0).sort((a, b) => a.pnl - b.pnl).slice(0, limit);

  return { winners, losers };
}

/**
 * Flags positions that make up more than `threshold`% of the portfolio.
 * Concentration is the risk that a tag alone won't show you.
 */
export function concentrationWarnings(holdings: AnalysisHolding[], threshold = 25): Breakdown[] {
  return breakdownBy(holdings, (h) => h.symbol).filter((b) => b.percent > threshold);
}

/**
 * Cross-check between time horizon and risk: money you may need soon should
 * not be sitting in high-risk positions. Returns the offending holdings.
 */
export function horizonRiskMismatches(holdings: AnalysisHolding[]): AnalysisHolding[] {
  return holdings.filter(
    (h) => h.timeHorizon === "short" && (h.riskLevel === "high" || h.riskLevel === "very_high")
  );
}


/** Every dimension the analysis can be grouped by. */
export const GROUP_BY_OPTIONS = [
  { value: "playlist", label: "Playlist" },
  { value: "account", label: "Account / wallet" },
  { value: "assetType", label: "Asset type" },
  { value: "riskLevel", label: "Risk" },
  { value: "expectedReturn", label: "Expected return" },
  { value: "timeHorizon", label: "Time horizon" },
  { value: "liquidity", label: "Liquidity" },
  { value: "direction", label: "Long / Short" },
  { value: "symbol", label: "Position" },
] as const;

export type GroupByKey = (typeof GROUP_BY_OPTIONS)[number]["value"];

export function groupKeyOf(h: AnalysisHolding, key: GroupByKey): string | null | undefined {
  switch (key) {
    case "playlist":
      return h.playlistName;
    case "account":
      return h.accountName;
    case "assetType":
      return h.assetType;
    case "riskLevel":
      return h.riskLevel;
    case "expectedReturn":
      return h.expectedReturn;
    case "timeHorizon":
      return h.timeHorizon;
    case "liquidity":
      return h.liquidity;
    case "direction":
      return h.direction ?? "long";
    case "symbol":
      return h.symbol;
  }
}

export interface GroupPerformance {
  key: string;
  value: number;
  cost: number;
  pnl: number;
  pnlPercent: number;
  realized: number;
  /** Share of total portfolio value. */
  percent: number;
  count: number;
  /**
   * What the group is made of, largest first.
   *
   * Carried on the group rather than fetched separately when a row is opened,
   * so the detail cannot disagree with the total above it — the members are
   * the very rows the total was summed from.
   */
  members: GroupMember[];
}

/**
 * Full performance breakdown for any grouping — this is what answers
 * "which playlist is doing best?" for whichever dimension is chosen.
 */
export interface GroupMember {
  symbol: string;
  value: number;
  cost: number;
  pnl: number;
  pnlPercent: number;
  /** Realised on this instrument, from the trade history where one is known. */
  realized: number;
  /**
   * Weight inside its own group, 0-100 — not of the portfolio.
   *
   * The group's own share of the portfolio is already on the row above it, and
   * repeating that here would answer a question nobody asked while hiding the
   * one they did: which position is this group actually made of.
   */
  shareOfGroup: number;
}

export function performanceBy(
  holdings: AnalysisHolding[],
  key: GroupByKey,
  unsetLabel = "Unset",
  /**
   * Realised results per instrument, from the trade history.
   *
   * Optional, and passed rather than derived: a holding's own `realizedPnl` is
   * only ever written by a manual sale, so for anyone whose trades arrive from
   * a connector or an import it is zero for every position — which made the
   * Realised column of this table structurally incapable of showing anything
   * else. The real figures live in `investment_activities`, keyed by a symbol
   * this module has no business joining on.
   */
  realisedBySymbol?: ReadonlyMap<string, number>
): GroupPerformance[] {
  const totalValue = holdings.reduce((s, h) => s + marketValue(h), 0);
  const groups = new Map<string, AnalysisHolding[]>();

  for (const h of holdings) {
    const k = groupKeyOf(h, key) ?? unsetLabel;
    const list = groups.get(k) ?? [];
    list.push(h);
    groups.set(k, list);
  }

  return Array.from(groups.entries())
    .map(([k, list]) => {
      const value = list.reduce((s, h) => s + marketValue(h), 0);
      const cost = list.reduce((s, h) => s + costBasis(h), 0);
      const pnl = list.reduce((s, h) => s + unrealizedPnL(h), 0);
      /** The trade history's figure where there is one, the holding's otherwise. */
      const realisedOf = (h: AnalysisHolding) =>
        realisedBySymbol?.get(h.symbol) ?? h.realizedPnl ?? 0;
      const realized = list.reduce((s, h) => s + realisedOf(h), 0);

      return {
        key: k,
        value: round2(value),
        cost: round2(cost),
        pnl: round2(pnl),
        pnlPercent: cost === 0 ? 0 : round2((pnl / cost) * 100),
        realized: round2(realized),
        percent: totalValue === 0 ? 0 : round2((value / totalValue) * 100),
        count: list.length,
        members: list
          .map((h) => {
            const memberValue = marketValue(h);
            const memberCost = costBasis(h);
            return {
              symbol: h.symbol,
              value: round2(memberValue),
              cost: round2(memberCost),
              pnl: round2(unrealizedPnL(h)),
              pnlPercent: memberCost === 0 ? 0 : round2((unrealizedPnL(h) / memberCost) * 100),
              realized: round2(realisedOf(h)),
              // Of the group, not of the portfolio. A group worth nothing has
              // no shares to divide, and 0% would claim each member is
              // weightless rather than that the question has no answer.
              shareOfGroup: value === 0 ? 0 : round2((memberValue / value) * 100),
            };
          })
          .sort((a, b) => b.value - a.value),
      };
    })
    .sort((a, b) => b.value - a.value);
}

/**
 * Every column the breakdown can be ordered by, in the order they're shown.
 *
 * "P&L" used to sit unqualified next to "Realised" in the same table, which
 * left the reader to infer that the first one meant the other kind. Both are
 * named now: one is profit on paper that a price move can take back, the other
 * is money already off the table. The whole codebase keeps them in separate
 * fields for that reason, and the headings should not blur what the model is
 * careful about.
 */
export const SORT_COLUMNS = [
  { key: "key", label: "Group", numeric: false },
  { key: "count", label: "Positions", numeric: true },
  { key: "value", label: "Value", numeric: true },
  { key: "cost", label: "Cost", numeric: true },
  { key: "pnl", label: "Unrealized P&L", numeric: true },
  { key: "pnlPercent", label: "Unrealized %", numeric: true },
  { key: "realized", label: "Realized", numeric: true },
] as const;

export type SortKey = (typeof SORT_COLUMNS)[number]["key"];

/** Sorts a performance breakdown by any column, descending by default. */
export function sortPerformance(
  rows: GroupPerformance[],
  sortKey: SortKey = "value",
  direction: "asc" | "desc" = "desc"
): GroupPerformance[] {
  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv));
    }
    return av - bv;
  });
  return direction === "desc" ? sorted.reverse() : sorted;
}
