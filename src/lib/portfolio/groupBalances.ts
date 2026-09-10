/**
 * One row per coin, with the accounts holding it underneath.
 *
 * A spot list with a row per (coin, account) answers "where is it" and hides
 * "how much of it do I have" — two EUR rows and two USDT rows on a seven-row
 * table, and the reader adding them by eye. Grouping answers both: the coin
 * once, and where it sits below.
 *
 * The whole difficulty is the total, and it is the recurring one in this
 * codebase. A balance is denominated in itself when it is cash and in the
 * platform's currency when it is a token, so two rows of the same coin are not
 * guaranteed to be the same currency — and adding them raw produces a number in
 * none, which is the bug this project has fixed nine times.
 *
 * So the group total is only ever stated in a currency every part shares. Where
 * they differ it is left absent and the parts are shown as themselves, because
 * a total nobody can convert is not a total, and printing one anyway is how a
 * figure gets trusted that shouldn't be.
 *
 * Pure — no DB, no React.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface BalanceLike {
  id: string;
  coin: string;
  accountName: string;
  total: number;
  available: number;
  price: number | null;
  /** Market value, in `currency`. Null when nothing could price it. */
  usdValue: number | null;
  /** What `usdValue` and `price` are actually denominated in. */
  currency: string;
}

export interface BalanceGroup<T extends BalanceLike> {
  coin: string;
  /** Units held across every account. Always addable — a coin is a coin. */
  total: number;
  available: number;
  /**
   * Market value across every account, and the currency it is in.
   *
   * Null when the parts are in different currencies, or when any of them could
   * not be priced. Absent is not zero: a group holding something unpriced has
   * a value nobody knows, not a value of nothing.
   */
  value: number | null;
  /** The one currency every part shares, or null when they do not share one. */
  currency: string | null;
  /** Where it is, largest first. Always shown — the group is a summary of it. */
  parts: T[];
}

/**
 * Groups balances by coin, keeping every part.
 *
 * Ordered by value where a group has one, and by units otherwise, so a coin
 * whose worth is unknown still lands somewhere predictable instead of at the
 * end by accident.
 */
export function groupBalancesByCoin<T extends BalanceLike>(rows: readonly T[]): BalanceGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.coin.toUpperCase();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([coin, parts]) => {
      const currencies = new Set(parts.map((p) => p.currency));
      const shared = currencies.size === 1 ? [...currencies][0] : null;
      const priced = parts.every((p) => p.usdValue !== null);

      return {
        coin,
        total: parts.reduce((s, p) => s + p.total, 0),
        available: parts.reduce((s, p) => s + p.available, 0),
        // Only where every part is priced and in the same currency. One
        // unpriced part makes the group's worth unknown, not smaller.
        value: shared !== null && priced ? round2(parts.reduce((s, p) => s + (p.usdValue ?? 0), 0)) : null,
        currency: shared,
        parts: [...parts].sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)),
      };
    })
    .sort((a, b) => {
      if (a.value !== null && b.value !== null) return b.value - a.value;
      if (a.value !== null) return -1;
      if (b.value !== null) return 1;
      return b.total - a.total;
    });
}

/**
 * Why a group shows no total, in words, or null when it shows one.
 *
 * Said on the row rather than left blank: a missing figure with no explanation
 * reads as a broken column, and this one is a deliberate refusal.
 */
export function explainMissingTotal<T extends BalanceLike>(group: BalanceGroup<T>): string | null {
  if (group.value !== null) return null;

  if (group.currency === null) {
    const currencies = [...new Set(group.parts.map((p) => p.currency))].sort();
    return `held in ${currencies.join(" and ")}, which cannot be added without a rate`;
  }
  return "one of these could not be priced, so the total is unknown rather than lower";
}
