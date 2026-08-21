/**
 * A goal made of cash AND investments.
 *
 * Buckets already spanned several accounts — the allocation table has always
 * been (account, bucket, amount), so "House deposit" could be €1 000 at one
 * bank plus €2 000 at another. What was missing is the other half: part of a
 * *position* counting towards a goal. "70% of this ETF is the house deposit,
 * 30% is long term" had nowhere to live.
 *
 * Cash and investments are allocated differently on purpose:
 *
 *   cash       — a fixed AMOUNT. €1 000 set aside is €1 000 tomorrow.
 *   investment — a PERCENTAGE of the position. Allocating a fixed €1 500 of an
 *                ETF would be a lie the moment the price moves; either the
 *                bucket silently changes size or the leftover has to go
 *                somewhere. A share tracks the market honestly.
 *
 * The consequence is that a goal can now go DOWN, and the app has to say so
 * rather than hiding it behind a total.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CashAllocation {
  bucketId: string;
  accountId: string;
  /** In the base currency, already converted. */
  amount: number;
}

export interface HoldingAllocation {
  bucketId: string;
  holdingId: string;
  /** 0-100. */
  percent: number;
  /** Current market value of the whole position, in base currency. */
  marketValue: number;
  /** What that share cost, in base currency. Null when unknown. */
  costBasis: number | null;
  /** False for cash, stablecoins and other capital-stable types. */
  floating: boolean;
}

export interface PurposeTotals {
  /** Everything the goal holds, cash and investments. */
  total: number;
  /** The part that cannot fall: cash and capital-stable holdings. */
  stable: number;
  /** The part exposed to the market. */
  floating: number;
  /** Cash allocations only. */
  cash: number;
  /** Market value of the allocated share of positions. */
  invested: number;
  /** What the invested share cost, when known. */
  investedCost: number;
  /** Unrealised gain or loss on the invested share. */
  investedPnl: number;
}

export function purposeTotals(
  bucketId: string,
  cash: CashAllocation[],
  holdings: HoldingAllocation[]
): PurposeTotals {
  const cashTotal = cash
    .filter((c) => c.bucketId === bucketId)
    .reduce((s, c) => s + c.amount, 0);

  const mine = holdings.filter((h) => h.bucketId === bucketId);

  let invested = 0;
  let investedCost = 0;
  let floating = 0;
  let knownCost = true;

  for (const h of mine) {
    const share = clampPercent(h.percent) / 100;
    const value = h.marketValue * share;
    invested += value;
    if (h.floating) floating += value;
    if (h.costBasis === null) knownCost = false;
    else investedCost += h.costBasis * share;
  }

  return {
    total: round2(cashTotal + invested),
    // Cash is stable by definition; a stablecoin holding is stable by tag.
    stable: round2(cashTotal + (invested - floating)),
    floating: round2(floating),
    cash: round2(cashTotal),
    invested: round2(invested),
    investedCost: knownCost ? round2(investedCost) : 0,
    investedPnl: knownCost ? round2(invested - investedCost) : 0,
  };
}

/** Percentages come from a form, so they get clamped rather than trusted. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

/**
 * How much of a position has been promised, across every goal.
 *
 * Over-allocating a position is the investment version of over-allocating an
 * account, and it deserves the same warning: promising 140% of an ETF to your
 * goals means at least one of them is counting money that isn't there.
 */
export function allocatedPercent(holdingId: string, allocations: HoldingAllocation[]): number {
  return round2(
    allocations
      .filter((a) => a.holdingId === holdingId)
      .reduce((s, a) => s + clampPercent(a.percent), 0)
  );
}

export function isOverAllocated(holdingId: string, allocations: HoldingAllocation[]): boolean {
  // A hundredth of a percent of slack, so rounding never raises a false alarm.
  return allocatedPercent(holdingId, allocations) > 100.01;
}

/** The share of a position not promised to any goal. */
export function unallocatedPercent(holdingId: string, allocations: HoldingAllocation[]): number {
  return round2(Math.max(0, 100 - allocatedPercent(holdingId, allocations)));
}

/**
 * What share of all bucketed money sits in each goal.
 *
 * Descriptive, not prescriptive. The old percentage plan said what each bucket
 * *should* hold and then nagged about the drift, which duplicated the
 * distributor and gave two different answers to the same question. This just
 * says where the money is — the useful half, and the half that can't be wrong.
 */
export function sharesOfTotal(
  totals: { id: string; total: number }[]
): { id: string; percent: number }[] {
  const sum = totals.reduce((s, t) => s + Math.max(0, t.total), 0);
  if (sum <= 0) return totals.map((t) => ({ id: t.id, percent: 0 }));
  return totals.map((t) => ({
    id: t.id,
    percent: round2((Math.max(0, t.total) / sum) * 100),
  }));
}

export interface GoalProgress {
  current: number;
  target: number | null;
  percent: number | null;
  /** Progress counting only money that cannot fall. */
  conservativePercent: number | null;
  reached: boolean;
}

/**
 * Progress towards a goal, reported twice.
 *
 * A goal 100% funded by an ETF is not the same as one funded by cash, and one
 * number cannot say both. The conservative figure ignores everything exposed to
 * the market, so you can see how much of the goal survives a bad month.
 */
export function goalProgress(totals: PurposeTotals, target: number | null): GoalProgress {
  if (target === null || target <= 0) {
    return {
      current: totals.total,
      target: null,
      percent: null,
      conservativePercent: null,
      reached: false,
    };
  }

  return {
    current: totals.total,
    target,
    percent: round2((totals.total / target) * 100),
    conservativePercent: round2((totals.stable / target) * 100),
    reached: totals.total >= target,
  };
}
