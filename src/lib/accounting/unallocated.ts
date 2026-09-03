/**
 * What "free" is allowed to mean.
 *
 * Free money is money committed to nothing. Not "the balance", and not "what
 * the platform lets you withdraw" — both of those include amounts you have
 * already promised elsewhere.
 *
 * Three things can hold money back, and the app was only ever counting some of
 * them at a time:
 *
 *  1. **Margin.** On a leveraged account part of the equity backs open trades.
 *     Counted for connected accounts, and correctly.
 *  2. **Buckets.** Money you assigned to a goal. Counted for manual accounts
 *     and *silently skipped for connected ones* — so an emergency fund sitting
 *     on an exchange still read as free.
 *  3. **Pending orders.** Reserved and unavailable. Some platforms tell us;
 *     where they do, it is already inside their withdrawable figure.
 *
 * A figure labelled "free" that includes any of these invites you to plan with
 * money that isn't there, which is the specific harm this file exists to stop.
 *
 * Pure — no DB, no network.
 */

import { eligibleCash, type AccountLike } from "./index";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface UnallocatedInput {
  /**
   * Spendable on the platform's own terms, margin already deducted. For a
   * manual account this is simply the balance.
   */
  availableOnPlatform: number;
  /**
   * A separate pool that isn't backing anything — Hyperliquid's spot USDC, for
   * instance. Kept apart because it obeys different rules from the margin
   * account and needs moving before it can back a trade.
   */
  separatePool?: number;
  /** Assigned to buckets, whatever account it physically sits in. */
  allocatedToBuckets: number;
  /** Locked as margin, for explaining the figure rather than computing it. */
  marginUsed?: number;
}

export interface UnallocatedView {
  /** Committed to nothing at all. The only number that deserves the word. */
  free: number;
  /** Spendable on the platform but promised to a bucket. */
  reservedForBuckets: number;
  /** Locked behind open trades. */
  lockedAsMargin: number;
  /** In a pool of its own, unencumbered but not in the margin account. */
  inSeparatePool: number;
  /**
   * True when buckets promise more than the account can currently spend.
   *
   * Surfaced rather than clamped away: it means a goal is funded by money that
   * isn't there, and rounding it to zero hides a real problem.
   */
  overAllocated: boolean;
}

/**
 * Splits free cash into the part that is investing money and the part you
 * could actually live on.
 *
 * Cash waiting in a broker to buy something is free in the sense that nothing
 * holds it, and not free in the sense that matters when you ask "can I afford
 * this?". The dashboard's free-cash figure is the one people check before
 * committing to a purchase, so counting a trading float in it overstates what
 * is genuinely available.
 *
 * `percent` is null when nobody has said. Treated as spendable — the app should
 * not quietly decide that your money is earmarked — but reported as unset so
 * the interface can ask rather than assume.
 */
export function splitPortfolioCash(
  free: number,
  percent: number | null
): { spendable: number; belongsToPortfolio: number; unset: boolean } {
  if (percent === null) {
    return { spendable: round2(free), belongsToPortfolio: 0, unset: true };
  }

  const share = Math.min(100, Math.max(0, percent)) / 100;
  // Only positive balances are split. A negative free figure means the buckets
  // are over-promised, and apportioning a shortfall would obscure that.
  const base = Math.max(0, free);
  const forPortfolio = round2(base * share);

  return {
    spendable: round2(free - forPortfolio),
    belongsToPortfolio: forPortfolio,
    unset: false,
  };
}

export function unallocatedCash(input: UnallocatedInput): UnallocatedView {
  const separate = input.separatePool ?? 0;
  const spendable = input.availableOnPlatform + separate;
  const free = spendable - input.allocatedToBuckets;

  return {
    free: round2(free),
    reservedForBuckets: round2(Math.min(input.allocatedToBuckets, Math.max(0, spendable))),
    lockedAsMargin: round2(input.marginUsed ?? 0),
    inSeparatePool: round2(separate),
    overAllocated: free < -0.005,
  };
}

/**
 * What a connector says about an account, reduced to what "free" needs.
 *
 * Deliberately not the whole platform total: equity and unrealized P&L say what
 * the account is worth, and this file is only ever asked what could be spent.
 */
export interface PlatformCashLike {
  /** Free to trade with — margin already deducted, separate pool included. */
  available: number;
  /** The part of `available` sitting in a pool of its own. */
  spot: number;
  /** Backing open trades. Carried so the figure can explain itself. */
  marginUsed: number;
}

/**
 * The one definition of an account's free cash, connected or not.
 *
 * There used to be three, and they disagreed on live data. An IBKR account
 * holding 10.34 USD showed a balance of 34.24 next to 134.24 "free" — more
 * spendable money than the account contained — because the balance column read
 * the platform while the free column read `accounts.balance`, a stored figure a
 * manual transaction had pushed 100 above what the venue actually held.
 *
 * Cosmetic on the accounts screen, not cosmetic anywhere else: the same stored
 * figure fed the buckets page's "distributable" total and `suggestDistribution`,
 * so the app was offering to assign a hundred euros that were not on the
 * platform. Which is the exact harm the top of this file exists to prevent,
 * arrived at through a second definition rather than a wrong one.
 *
 * A connected account's own balance is not consulted at all. The platform is
 * the authority on what is on the platform.
 */
export function accountFreeCash(
  account: AccountLike,
  allocatedToBuckets: number,
  platform?: PlatformCashLike | null
): UnallocatedView {
  if (!platform) {
    return unallocatedCash({
      availableOnPlatform: eligibleCash(account),
      allocatedToBuckets,
    });
  }

  return unallocatedCash({
    // `available` already contains the separate pool; pulling it back out here
    // and passing it as `separatePool` is what lets the view name it without
    // counting it twice.
    availableOnPlatform: platform.available - platform.spot,
    separatePool: platform.spot,
    allocatedToBuckets,
    marginUsed: platform.marginUsed,
  });
}

/**
 * The deductions, in words, so the number can explain itself.
 *
 * Only what actually applies: a cash account with no margin and no buckets
 * shouldn't be handed a list of caveats that are all zero.
 */
export function explainFree(view: UnallocatedView, currency: string): string[] {
  const parts: string[] = [];
  const money = (n: number) => `${n.toFixed(2)} ${currency}`;

  if (view.lockedAsMargin > 0) {
    parts.push(`${money(view.lockedAsMargin)} is backing open trades and can't be spent`);
  }
  if (view.reservedForBuckets > 0) {
    parts.push(`${money(view.reservedForBuckets)} is assigned to buckets`);
  }
  if (view.inSeparatePool > 0) {
    parts.push(`${money(view.inSeparatePool)} sits in a separate pool on the platform`);
  }
  if (view.overAllocated) {
    parts.push("buckets promise more than this account can currently spend");
  }
  return parts;
}
