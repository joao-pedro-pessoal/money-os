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
}

export interface BucketAllocationLike {
  accountId: string;
  amount: number;
}

export type ReconciliationState = "RECONCILED" | "STALE" | "OVERALLOCATED";

/** Eligible cash for a single account is simply its current balance in V1. */
export function eligibleCash(account: AccountLike): number {
  return account.balance;
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
