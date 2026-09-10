/**
 * When is an account safe to delete without asking?
 *
 * A failed connection attempt leaves an account behind. Retry three times and
 * you have three "Bybit" rows, all at zero, cluttering the dashboard and
 * dragging the net-worth chart along the floor. Deleting is destructive and
 * cascades to transactions, so the rule has to be conservative: an account
 * qualifies only if nothing at all points at it and it holds no money.
 *
 * Pure on purpose — the decision is the part worth testing, the counting is
 * just queries.
 */

export interface AccountUsage {
  id: string;
  name: string;
  institution: string;
  balance: number;
  transactions: number;
  holdings: number;
  allocations: number;
  connections: number;
  imports: number;
  snapshots: number;
}

/** Every reason an account has to keep existing. Empty = safe to remove. */
export function reasonsToKeep(u: AccountUsage): string[] {
  const reasons: string[] = [];
  // A non-zero balance is real money, even if nothing else references it.
  if (Math.abs(u.balance) > 0.004) reasons.push("holds a balance");
  if (u.transactions > 0)
    reasons.push(`${u.transactions} transaction${u.transactions === 1 ? "" : "s"}`);
  if (u.holdings > 0) reasons.push(`${u.holdings} position${u.holdings === 1 ? "" : "s"}`);
  if (u.allocations > 0) reasons.push("money assigned to buckets");
  if (u.connections > 0) reasons.push("a connection is attached");
  if (u.imports > 0) reasons.push("imported files reference it");
  // Snapshots are history: a sync happened here once, so the chart would
  // change shape if the account disappeared.
  if (u.snapshots > 0) reasons.push(`${u.snapshots} balance snapshots`);
  return reasons;
}

export function isAbandoned(u: AccountUsage): boolean {
  return reasonsToKeep(u).length === 0;
}

/**
 * Of several abandoned accounts for the same institution, reuse the oldest.
 *
 * Deterministic so a retry lands on the same row every time rather than
 * hopping between identical-looking empties.
 */
export function pickReusable<T extends AccountUsage & { createdAt: Date | string }>(
  candidates: T[],
  institution: string
): T | null {
  const matches = candidates
    .filter((c) => c.institution.trim().toLowerCase() === institution.trim().toLowerCase())
    .filter(isAbandoned)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return matches[0] ?? null;
}
