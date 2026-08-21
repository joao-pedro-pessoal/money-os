/**
 * Pure accounting functions for the Money OS.
 * No DB, no I/O — deterministic math only, per MVP_SPEC.md section 4.
 *
 * All amounts are represented as numbers (already parsed from the DB's
 * numeric/decimal columns) in the account's base currency (EUR/USD, V1).
 */

export interface AccountLike {
  id: string;
  balance: number;
  /**
   * For an account whose balance is partly invested, the invested part.
   *
   * Trade Republic's balance is one number covering the card money and the
   * ETFs. Without this, "free cash" is the whole account — the ETFs included —
   * and the dashboard tells you that you can spend your portfolio.
   *
   * Absent for every other kind of account, which is why it's optional: a
   * balance that is all cash has nothing to subtract.
   */
  investedValue?: number | null;
}

export interface BucketAllocationLike {
  accountId: string;
  amount: number;
}

export type ReconciliationState = "RECONCILED" | "STALE" | "OVERALLOCATED";

/**
 * The part of an account you could actually spend.
 *
 * The balance, minus whatever of it is invested. For almost every account
 * nothing is invested and this is the balance, unchanged.
 *
 * Never negative and never above the balance: an invested figure larger than
 * the account it sits in is a contradiction, and the arithmetic should not
 * propagate it into a negative "free" that would then be reported as an
 * overallocation somewhere else entirely.
 */
export function eligibleCash(account: AccountLike): number {
  const invested = Math.min(Math.max(account.investedValue ?? 0, 0), account.balance);
  return round2(account.balance - invested);
}

/** Sum of all bucket allocations pointing at this account. */
export function allocatedCash(
  accountId: string,
  allocations: BucketAllocationLike[]
): number {
  return round2(
    allocations
      .filter((a) => a.accountId === accountId)
      .reduce((sum, a) => sum + a.amount, 0)
  );
}

/** Free Cash = Eligible Cash − Allocated Cash (can go negative -> overallocated). */
export function freeCash(
  account: AccountLike,
  allocations: BucketAllocationLike[]
): number {
  return round2(eligibleCash(account) - allocatedCash(account.id, allocations));
}

/** Net Worth = sum of balances of all active accounts. */
export function netWorth(accounts: AccountLike[]): number {
  return round2(accounts.reduce((sum, a) => sum + a.balance, 0));
}

/**
 * Reconciliation state for an account, per MVP_SPEC.md section 4:
 * - OVERALLOCATED takes priority over staleness — an overallocation is a
 *   correctness problem, not just a freshness problem.
 * - STALE if the balance hasn't been updated within `staleAfterDays`.
 * - RECONCILED otherwise.
 */
export function reconciliationState(
  account: AccountLike,
  allocations: BucketAllocationLike[],
  lastManualUpdate: Date,
  now: Date = new Date(),
  staleAfterDays = 14
): ReconciliationState {
  const allocated = allocatedCash(account.id, allocations);
  if (allocated > eligibleCash(account)) {
    return "OVERALLOCATED";
  }
  const ageDays =
    (now.getTime() - lastManualUpdate.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > staleAfterDays) {
    return "STALE";
  }
  return "RECONCILED";
}

/** How much an account is overallocated by (0 if not overallocated). */
export function overallocatedAmount(
  account: AccountLike,
  allocations: BucketAllocationLike[]
): number {
  const diff = allocatedCash(account.id, allocations) - eligibleCash(account);
  return diff > 0 ? round2(diff) : 0;
}

/** Total allocated amount for a given bucket, across all accounts. */
export function bucketTotal(
  bucketId: string,
  allocations: (BucketAllocationLike & { bucketId: string })[]
): number {
  return round2(
    allocations
      .filter((a) => a.bucketId === bucketId)
      .reduce((sum, a) => sum + a.amount, 0)
  );
}

/**
 * Net effect on Net Worth and Cash Flow of a transaction, given its type.
 * Transfers and internal legs never move Net Worth or count as income/expense
 * at the aggregate level (MVP_SPEC.md section 4 / PRODUCT_VISION.md section 9).
 */
export function isCashFlowRelevant(type: string): boolean {
  return type === "income" || type === "expense";
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
