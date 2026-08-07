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


/**
 * Rescales every bucket except `keepId` so the whole plan totals 100%.
 *
 * The bucket you just set is treated as fixed — that's the number you meant —
 * and the rest share what's left, in proportion to what they had. This makes
 * "I want 99% here" recoverable instead of an error you have to fix by hand.
 *
 * Returns the new percentage per bucket id, including the untouched one.
 */
export function fitOthersAround(
  buckets: { id: string; targetPercent: number | null }[],
  keepId: string
): Record<string, number | null> {
  const kept = buckets.find((b) => b.id === keepId);
  const keptPercent = Math.min(100, Math.max(0, kept?.targetPercent ?? 0));
  const others = buckets.filter((b) => b.id !== keepId && b.targetPercent !== null);

  const remaining = round2(100 - keptPercent);
  const othersTotal = others.reduce((s, b) => s + (b.targetPercent ?? 0), 0);

  const result: Record<string, number | null> = {};
  for (const b of buckets) result[b.id] = b.targetPercent;
  result[keepId] = keptPercent;

  if (others.length === 0) return result;

  if (othersTotal === 0) {
    // Nothing to scale proportionally — split what's left evenly.
    const each = round2(remaining / others.length);
    for (const b of others) result[b.id] = each;
    return result;
  }

  let assigned = 0;
  others.forEach((b, i) => {
    const share =
      i === others.length - 1
        ? round2(remaining - assigned) // last one absorbs the rounding
        : round2((remaining * (b.targetPercent ?? 0)) / othersTotal);
    result[b.id] = share;
    assigned = round2(assigned + share);
  });

  return result;
}
