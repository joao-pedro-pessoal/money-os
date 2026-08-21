/**
 * What does a manual account's balance actually mean?
 *
 * A synced connector answers this via `balancesAreSeparatePool` — it states
 * whether the balances it returns sit outside the equity it reports. A manual
 * account had no way to say, and the app assumed one answer for everybody:
 * balance = idle cash, positions add on top.
 *
 * That assumption is wrong for a broker. If you read "12 400 €" off the Trading
 * 212 app and type it into the balance, that figure ALREADY contains your ETFs.
 * Recording the ETFs as holdings then counts them twice. Net worth goes up by
 * the value of your portfolio, and nothing in the app objects.
 *
 * This is the same bug that has now appeared six times in six disguises, so it
 * gets the same treatment as the fifth one: the source declares what its number
 * means, and the total-computing code obeys the declaration instead of guessing.
 */

export type BalanceMeaning = "cash_only" | "includes_positions" | "bank_and_broker";

export const BALANCE_MEANINGS: {
  value: BalanceMeaning;
  label: string;
  help: string;
}[] = [
  {
    value: "cash_only",
    label: "Cash sitting idle",
    help: "The balance is money not invested. Positions you record for this account are added on top of it.",
  },
  {
    value: "includes_positions",
    label: "Total value, positions included",
    help: "The balance is the whole account as the broker shows it, investments already inside. Positions here are for detail only and are not added again.",
  },
  {
    value: "bank_and_broker",
    label: "Both — a bank account with investments inside",
    help: "One account that holds spendable money and investments together, like Trade Republic. Enter the whole total, then say how much of it is invested; the rest is treated as cash.",
  },
];

export function isBalanceMeaning(value: string): value is BalanceMeaning {
  return (
    value === "cash_only" || value === "includes_positions" || value === "bank_and_broker"
  );
}

/** Falls back to the historical assumption so existing rows keep their meaning. */
export function meaningOf(value: string | null | undefined): BalanceMeaning {
  return value && isBalanceMeaning(value) ? value : "cash_only";
}

/**
 * Should this holding's market value be added to the portfolio total?
 *
 * A holding with no account belongs to nobody's balance, so it always counts.
 * A holding inside an account that already reports its positions does not.
 */
export function holdingCountsOnTop(
  accountId: string | null | undefined,
  meaningByAccount: Map<string, BalanceMeaning>
): boolean {
  if (!accountId) return true;
  return meaningOf(meaningByAccount.get(accountId)) === "cash_only";
}

export interface AccountShape {
  id: string;
  balance: number;
  meaning: BalanceMeaning;
  /** Market value of holdings linked to this account, same currency. */
  holdingsValue: number;
  /** True when a connector syncs it — the connector's own rule wins. */
  synced: boolean;
  /**
   * For `bank_and_broker`: how much of `balance` is invested rather than
   * spendable. The rest is cash.
   *
   * A declared number, not a derived one, for the usual reason — the split is
   * something only the account holder can see, and inferring it from positions
   * would be inferring exactly the thing that has gone wrong seven times.
   */
  investedValue?: number | null;
}

export interface AccountBreakdown {
  /** Counted as cash in Net Worth. */
  cash: number;
  /** Added to Portfolio Value on top of the cash. */
  portfolioOnTop: number;
  /** Value shown for information but already inside `cash`. */
  alreadyInside: number;
  total: number;
}

/**
 * What one account contributes, with the overlap made explicit.
 *
 * The third case is the interesting one. Trade Republic is a bank *and* a
 * broker: one IBAN, one app, one total, with spendable money and ETFs inside
 * it. Modelling that as two accounts works arithmetically but forces a lie —
 * whichever half you don't split off gets the other's nature, so either the
 * card money counts as invested or the ETFs count as capital-guaranteed.
 *
 * So the account keeps one balance, the whole total, and declares how much of
 * it is invested. `cash + portfolioOnTop` still equals the balance, which is
 * the invariant that keeps Net Worth honest.
 */
export function accountBreakdown(a: AccountShape): AccountBreakdown {
  if (a.meaning === "bank_and_broker") {
    // Clamped to the balance: an invested figure larger than the account is a
    // contradiction, and letting it through would produce negative cash and a
    // total that no longer matches the balance.
    const invested = Math.min(Math.max(a.investedValue ?? 0, 0), a.balance);
    return {
      cash: a.balance - invested,
      portfolioOnTop: invested,
      // Positions here are detail: the declared figure is what counts, exactly
      // as with `includes_positions`.
      alreadyInside: a.holdingsValue,
      total: a.balance,
    };
  }

  const countsOnTop = a.meaning === "cash_only";
  return {
    cash: a.balance,
    portfolioOnTop: countsOnTop ? a.holdingsValue : 0,
    alreadyInside: countsOnTop ? 0 : a.holdingsValue,
    total: a.balance + (countsOnTop ? a.holdingsValue : 0),
  };
}

/**
 * A split account that hasn't been told what its split is.
 *
 * Silent otherwise: the whole balance would be filed as cash, so a Trade
 * Republic account full of ETFs would report itself as capital-guaranteed and
 * nothing would look broken.
 */
export function needsInvestedValue(a: AccountShape): boolean {
  return (
    a.meaning === "bank_and_broker" &&
    (a.investedValue === null || a.investedValue === undefined) &&
    a.balance > 0
  );
}

/**
 * A declared invested figure that exceeds the account holding it.
 *
 * Surfaced rather than quietly clamped, because the likeliest cause is the
 * balance being the cash half only while the invested figure is the whole
 * portfolio — in which case the account's total is understated, and clamping
 * hides that.
 */
export function investedExceedsBalance(a: AccountShape): boolean {
  return (
    a.meaning === "bank_and_broker" &&
    typeof a.investedValue === "number" &&
    a.investedValue > a.balance + 0.005
  );
}

/**
 * Accounts whose settings look like a double count waiting to happen.
 *
 * Flags the case that actually bites: a broker-ish account holding positions
 * while claiming its balance is idle cash, where the balance is large enough
 * that it probably isn't. Deliberately a question, never an automatic change —
 * "cash_only" with positions is perfectly legitimate (idle cash plus stock),
 * and silently rewriting someone's balance would be far worse than asking.
 */
export function suspectsDoubleCount(a: AccountShape): boolean {
  if (a.synced) return false; // The connector already declared its own rule.
  if (a.meaning !== "cash_only") return false;
  if (a.holdingsValue <= 0 || a.balance <= 0) return false;
  // If the "idle cash" is at least as big as the positions, it's more likely
  // to be the whole account than genuinely uninvested money.
  return a.balance >= a.holdingsValue;
}
