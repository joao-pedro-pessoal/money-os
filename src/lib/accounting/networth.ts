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
  /**
   * Investments sitting inside a `bank_and_broker` balance.
   *
   * Trade Republic is one account that is both a bank and a broker: its total
   * contains spendable money and ETFs together. That total arrives in `cash`
   * because it is a balance, and this says how much of it isn't cash at all.
   *
   * Handled exactly like `openPositionValue` — moved from cash to investments
   * without changing the total — because it is the same situation wearing
   * different clothes: money already counted once, filed under the wrong name.
   */
  declaredInvested?: number;
  /**
   * The same two figures, but per account — the balance, and how much of that
   * balance is investments.
   *
   * Supplied by `getNetWorth`, which knows which position belongs to which
   * account. When present it replaces the totals above for the purpose of
   * deciding how much may be reclassified, because a cap applied to the grand
   * total lets one account's leverage consume another account's free cash.
   *
   * Everything must already be in the base currency, like every other figure
   * here.
   */
  insideBalances?: { cash: number; invested: number }[];
  /**
   * What you owe: mortgages, loans, credit cards.
   *
   * Net worth is assets **minus** liabilities, and for a long time this app did
   * only the first half — so anyone with a mortgage was shown a patrimony that
   * did not exist. Defaults to zero, which is why every figure computed before
   * this existed stays exactly as it was.
   *
   * A debt that is already a negative account balance must not arrive here.
   * The balance has counted it once inside `cash`; passing it again would
   * subtract it twice, which is the same double-count this file exists to
   * prevent, only pointing the other way.
   */
  liabilities?: number;
  /** Amounts that had no exchange rate and were therefore left out entirely. */
  unconverted?: { amount: number; currency: string }[];
}

export interface NetWorthResult {
  /**
   * assets − liabilities. The headline number, and the whole reason the two
   * fields below are reported separately: "worth 40 000" means something
   * different when it is 40 000 owned outright and when it is 250 000 of house
   * against 210 000 of mortgage.
   */
  total: number;
  /** cash + portfolio, before anything owed is taken off. */
  assets: number;
  /** What you owe, as a positive number. */
  liabilities: number;
  cash: number;
  /** manualPortfolio + syncedPortfolio. */
  portfolio: number;
  /** Part of `total` that can move with the market. */
  floating: number;
  /** Part of `total` that is (near) capital-guaranteed. */
  guaranteed: number;
  /** Deliberately not counted, with the reason, so the UI can explain itself. */
  excluded: { openPositionValue: number; declaredInvested: number; reason: string };
  unconverted: { amount: number; currency: string }[];
}

export interface PurposeSplit {
  /** Assets a market can reprice. */
  invested: number;
  /** Money set aside to invest but not invested yet: stablecoins, idle cash you've earmarked. */
  waitingToInvest: number;
  /** Cash promised to a bucket. */
  promised: number;
  /** Cash committed to nothing. */
  free: number;
}

/**
 * Every euro under exactly one purpose.
 *
 * Four slices that must add to the net worth, no more and no less. Written as
 * one function because the Analytics chart got this wrong by assembling it from
 * pieces that overlapped — free cash counted once as cash and again inside the
 * investments figure — and reported 880 € against a net worth of 694 €.
 *
 * The order of the caps matters and is deliberate:
 *
 *  1. **Invested** is what a market can move. Stablecoins and cash are not in
 *     it, whichever account they sit in, because their price doesn't move.
 *  2. **Waiting to invest** is the stable money that is nonetheless investment
 *     money: stablecoins, and the share of an account's idle cash you have said
 *     is for investing. It is money you have, so it is not at risk; it is not
 *     spending money either, and calling it "free to spend" overstates what you
 *     could actually live on.
 *  3. **Promised** is capped by the cash that exists — buckets can be
 *     over-promised, and that must be visible elsewhere rather than inflating
 *     this.
 *  4. **Free** is whatever is left, and never negative.
 */
export function purposeSplit(input: {
  result: NetWorthResult;
  /** Idle cash the accounts declare as investing money, in base currency. */
  investingCash: number;
  /** Total promised to buckets, in base currency. */
  promisedToBuckets: number;
}): PurposeSplit {
  const { result } = input;

  // The part of the portfolio that holds its value: stablecoins, mostly.
  // `floating` is a slice of `portfolio`, so this cannot legitimately be
  // negative — the clamp is for the day something upstream breaks that.
  const stableInPortfolio = Math.max(0, round2(result.portfolio - result.floating));

  const invested = round2(result.floating);
  const promised = clamp(input.promisedToBuckets, 0, result.cash);
  const investingCash = clamp(input.investingCash, 0, round2(result.cash - promised));
  const waitingToInvest = round2(stableInPortfolio + investingCash);

  /**
   * The remainder of the whole, not of the cash.
   *
   * Deriving it from `cash` gives the same answer whenever the inputs are
   * consistent, and a chart that quietly stops adding up when they aren't. This
   * way the four slices always sum to the assets: if something upstream is
   * contradictory the free slice absorbs it and goes to zero, which is visible,
   * rather than the total drifting, which is not.
   *
   * The four slices describe what you **hold**, so they add to `assets` and not
   * to the headline. A mortgage is not a fifth purpose your money is serving —
   * it is money you do not have. Taking it off here would shrink "free to
   * spend" by the whole outstanding loan, which is exactly the wrong advice on
   * the day a payment is due.
   */
  return {
    invested,
    waitingToInvest,
    promised: round2(promised),
    free: round2(Math.max(0, result.assets - invested - waitingToInvest - promised)),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function computeNetWorth(input: NetWorthInput): NetWorthResult {
  const portfolio = round2(input.manualPortfolio + input.syncedPortfolio);
  const assets = round2(input.cash + portfolio);
  /**
   * Owed money is taken off the headline and off nothing else.
   *
   * It does not reduce what you hold — a mortgage does not make the cash in
   * your account any less spendable — so `cash`, `portfolio`, `floating` and
   * `guaranteed` all continue to describe the asset side alone. Only `total`
   * knows about the debt, because only `total` claims to be your net worth.
   *
   * Clamped at zero: a negative liability would be an asset, and if one ever
   * arrives it is a bug upstream rather than a windfall to be added in.
   */
  const liabilities = round2(Math.max(0, input.liabilities ?? 0));
  const total = round2(assets - liabilities);
  const floating = round2(input.floatingPortfolio);

  /**
   * Open positions are inside `cash`, and that made the split wrong.
   *
   * The total was right — equity counted once — but a broker account holding
   * €177 of ETFs reported it all as cash, because that is the shape it arrived
   * in. The dashboard then said "Investments: €0" next to a portfolio of ETFs.
   *
   * Moving the figure between the two buckets leaves the total untouched: the
   * same money, filed as what it actually is. Nothing may be moved that isn't
   * there: an account's investments cannot exceed the balance containing them.
   */
  const heldInPositions = reclassifiable(input);
  const cash = round2(input.cash - heldInPositions);
  const invested = round2(portfolio + heldInPositions);

  return {
    total,
    assets,
    liabilities,
    cash,
    portfolio: invested,
    // Positions are market-exposed wherever they are filed, so reclassifying
    // them has to move them out of the guaranteed side too — otherwise the app
    // would call €177 of ETFs capital-guaranteed.
    floating: round2(floating + heldInPositions),
    // Against assets, not against the headline: a mortgage does not make the
    // cash in your account any less guaranteed, and subtracting it here would
    // take the debt off twice.
    guaranteed: round2(assets - floating - heldInPositions),
    excluded: {
      openPositionValue: round2(input.openPositionValue),
      declaredInvested: round2(input.declaredInvested ?? 0),
      reason:
        "Open position value is not added to the total: it is already inside the account's equity. It is reported under investments rather than cash, which moves it between the two without changing what they add up to.",
    },
    unconverted: input.unconverted ?? [],
  };
}

/**
 * How much of the cash is actually investments wearing a balance's clothes.
 *
 * Capped **per account**, and that word is the whole point of this function.
 *
 * Capping against the grand total instead produced a dashboard reading
 * "Cash 0,00" beside a Free Cash card reading "2,46" — both computed correctly,
 * from different rules. Hyperliquid is leveraged, so the notional value of its
 * open positions is far larger than the money backing them; added to everything
 * else it exceeded the entire cash pile, and one global `min` then swallowed
 * the lot. Free money in one account was absorbed by borrowing in another,
 * which is not a thing that can happen outside a spreadsheet.
 *
 * Per account, each balance can only ever surrender itself. `insideBalances` is
 * how a caller says which euro lives where; without it the old total-wide cap
 * remains, which is right only when there is one account.
 */
function reclassifiable(input: NetWorthInput): number {
  if (input.insideBalances && input.insideBalances.length > 0) {
    return round2(
      input.insideBalances.reduce(
        (sum, a) => sum + Math.min(Math.max(a.invested, 0), Math.max(a.cash, 0)),
        0
      )
    );
  }

  const insideCash = round2(input.openPositionValue + (input.declaredInvested ?? 0));
  return Math.min(insideCash, round2(input.cash));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
