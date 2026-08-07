/**
 * THE definition of Net Worth. Nothing else in the app may sum money into a
 * patrimony figure — every page reads this.
 *
 * This exists because the same bug appeared four separate times: account
 * balances vs manual positions, exchange equity vs open positions, spot vs
 * account balance, and an unconverted portfolio added to converted cash. Each
 * was a different file quietly adding two numbers. Keeping the rule in one
 * tested place is the fix.
 *
 * Every input must ALREADY be converted to the base currency. Conversion is a
 * separate concern (src/lib/fx) and mixing the two is exactly how the fourth
 * bug happened.
 */

export interface NetWorthInput {
  /**
   * Cash you hold. For a connected exchange account this is its equity, which
   * already contains the unrealized P&L of open positions.
   */
  cash: number;
  /** Market value of manually tracked positions. */
  manualPortfolio: number;
  /** Synced spot balances (USDC and friends), which sit outside exchange equity. */
  syncedPortfolio: number;
  /**
   * Market value of open positions on connected platforms.
   *
   * Passed in ONLY so this function can state that it is excluded, and so a
   * test can prove it. It is already inside `cash` via equity; adding it would
   * count the same money twice.
   */
  openPositionValue: number;
  /** The market-exposed share of the portfolio (not capital-guaranteed). */
  floatingPortfolio: number;
  /** Amounts that had no exchange rate and were therefore left out entirely. */
  unconverted?: { amount: number; currency: string }[];
}

export interface NetWorthResult {
  /** cash + portfolio. The headline number. */
  total: number;
  cash: number;
  /** manualPortfolio + syncedPortfolio. */
  portfolio: number;
  /** Part of `total` that can move with the market. */
  floating: number;
  /** Part of `total` that is (near) capital-guaranteed. */
  guaranteed: number;
  /** Deliberately not counted, with the reason, so the UI can explain itself. */
  excluded: { openPositionValue: number; reason: string };
  unconverted: { amount: number; currency: string }[];
}

export function computeNetWorth(input: NetWorthInput): NetWorthResult {
  const portfolio = round2(input.manualPortfolio + input.syncedPortfolio);
  const total = round2(input.cash + portfolio);
  const floating = round2(input.floatingPortfolio);

  return {
    total,
    cash: round2(input.cash),
    portfolio,
    floating,
    guaranteed: round2(total - floating),
    excluded: {
      openPositionValue: round2(input.openPositionValue),
      reason:
        "Open position value is already inside the account's equity, which is counted as cash. Adding it would count the same money twice.",
    },
    unconverted: input.unconverted ?? [],
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
