/**
 * Percentage-based bucket planning.
 *
 * You declare "25% emergency, 30% travel, …" and this works out what each
 * bucket *should* hold against the money available, and how far each one has
 * drifted. Pure maths — deciding to act on it is a separate, explicit step.
 */

export interface PlannedBucket {
  id: string;
  name: string;
  /** Target share of available money, 0-100. Null means "no plan". */
  targetPercent: number | null;
  /** Currently allocated to this bucket. */
  current: number;
  /** Optional absolute goal, independent of the percentage plan. */
  targetAmount: number | null;
}

export interface PlanRow extends PlannedBucket {
  /** What the percentage implies this bucket should hold. */
  target: number;
  /** target - current. Positive means it needs more money. */
  drift: number;
  /** Share of the total this bucket actually holds right now, 0-100. */
  actualPercent: number;
  /** True once `current` reaches `targetAmount`. */
  goalReached: boolean;
}

export interface PlanSummary {
  rows: PlanRow[];
  /** Sum of declared percentages. Not forced to 100 — see `unplannedPercent`. */
  totalPercent: number;
  /** 100 - totalPercent, floored at 0. The share left deliberately free. */
  unplannedPercent: number;
  /** Money the plan leaves unallocated. */
  unplannedAmount: number;
  /** True when the declared percentages exceed 100. */
  overcommitted: boolean;
}

/**
 * Builds the plan against `available` money.
 *
 * Percentages are used as declared rather than normalised to 100: if they add
 * up to 80, the remaining 20% is genuinely meant to stay free, and silently
 * inflating each bucket to fill the gap would allocate money the user never
 * asked to allocate. Over 100% is flagged instead of being scaled down, since
 * that's a mistake worth seeing.
 */
export function buildPlan(buckets: PlannedBucket[], available: number): PlanSummary {
  const totalPercent = round2(
    buckets.reduce((s, b) => s + (b.targetPercent ?? 0), 0)
  );
  const totalCurrent = buckets.reduce((s, b) => s + b.current, 0);

  const rows: PlanRow[] = buckets.map((b) => {
    const target = b.targetPercent === null ? b.current : round2((available * b.targetPercent) / 100);
    return {
      ...b,
      target,
      drift: round2(target - b.current),
      actualPercent: totalCurrent === 0 ? 0 : round2((b.current / totalCurrent) * 100),
      goalReached: b.targetAmount !== null && b.targetAmount > 0 && b.current >= b.targetAmount,
    };
  });

  const planned = rows.reduce((s, r) => s + (r.targetPercent === null ? 0 : r.target), 0);

  return {
    rows,
    totalPercent,
    unplannedPercent: round2(Math.max(0, 100 - totalPercent)),
    unplannedAmount: round2(Math.max(0, available - planned)),
    overcommitted: totalPercent > 100,
  };
}

/** Progress toward an absolute goal, 0-100 and capped. */
export function goalProgress(current: number, targetAmount: number | null): number | null {
  if (targetAmount === null || targetAmount <= 0) return null;
  return round2(Math.min(100, (current / targetAmount) * 100));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
