/**
 * What one account is made of.
 *
 * The dashboard shows a figure per account, but a figure alone can't tell you
 * whether it's guaranteed. €5 000 at a bank and €5 000 of ETFs are the same
 * number and completely different money — which is the distinction this whole
 * app is built around. So each account reports its stable and floating parts,
 * and the floating part is shown in parentheses.
 *
 * Pure: the caller resolves currencies and holdings; this decides the split.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AccountPart {
  /** Value in the base currency. */
  value: number;
  /** True when the market can move it. */
  floating: boolean;
}

export interface Composition {
  /** Everything the account holds. */
  total: number;
  /** Cash and capital-stable assets. */
  stable: number;
  /** Exposed to the market. */
  floating: number;
  /** Unrealised gain or loss on the floating part, when known. */
  unrealisedPnl: number;
  /**
   * Market-exposed positions whose gain or loss could not be worked out, and
   * which are therefore **not** inside `unrealisedPnl`.
   *
   * A P&L needs two prices: what it cost and what it is worth. A holding with
   * no price yet has one of them, and a synced exchange balance has no cost
   * basis at all — neither can contribute, and neither contributes zero.
   *
   * Counted rather than ignored because the sum is otherwise a confident
   * number that quietly leaves things out, which is this codebase's most
   * repeated bug. A caller showing `unrealisedPnl` must say when this is above
   * zero, or it is showing a total it cannot stand behind.
   */
  pnlUnmeasured: number;
  /** Share of the account exposed to the market, 0-100. */
  floatingPercent: number | null;
}

export function compose(
  parts: AccountPart[],
  unrealisedPnl = 0,
  pnlUnmeasured = 0
): Composition {
  let stable = 0;
  let floating = 0;

  for (const p of parts) {
    if (p.floating) floating += p.value;
    else stable += p.value;
  }

  const total = stable + floating;
  return {
    total: round2(total),
    stable: round2(stable),
    floating: round2(floating),
    unrealisedPnl: round2(unrealisedPnl),
    pnlUnmeasured,
    floatingPercent: total === 0 ? null : round2((floating / total) * 100),
  };
}

/**
 * How an account has moved between two points.
 *
 * `contributions` is money you put in or took out. Subtracting it is the whole
 * point: an account that went from €1 000 to €2 000 because you deposited
 * €1 000 has grown by nothing, and calling that 100% growth would be the
 * flattering lie every finance app should refuse to tell.
 */
export interface Growth {
  from: number;
  to: number;
  change: number;
  percent: number | null;
  /** Change with deposits and withdrawals removed. Null when unknown. */
  gain: number | null;
  gainPercent: number | null;
}

export function growth(input: {
  from: number;
  to: number;
  contributions?: number | null;
}): Growth {
  const change = round2(input.to - input.from);
  const percent = input.from === 0 ? null : round2((change / Math.abs(input.from)) * 100);

  if (input.contributions === null || input.contributions === undefined) {
    return { from: round2(input.from), to: round2(input.to), change, percent, gain: null, gainPercent: null };
  }

  const gain = round2(change - input.contributions);
  // Measured against the money that was actually at work: the starting balance
  // plus whatever was added along the way.
  const base = input.from + Math.max(0, input.contributions);

  return {
    from: round2(input.from),
    to: round2(input.to),
    change,
    percent,
    gain,
    gainPercent: base === 0 ? null : round2((gain / base) * 100),
  };
}

export interface NetWorthPoint {
  date: string;
  netWorth: number;
  cash: number;
  portfolio: number;
  approximate: boolean;
}

/**
 * Two sparse step-series, merged into one net worth line.
 *
 * Both sides are recorded only on days something changed, so each carries
 * forward until the next reading. The union of their dates is the set of days
 * either side moved.
 *
 * The important part is what `portfolioOnTop` must contain: **only investments
 * that are not already inside an account balance.** Passing the whole portfolio
 * here is the eighth appearance of this codebase's recurring bug — a Trading
 * 212 balance already holds its ETFs, so adding them again drew a line at three
 * times the real total and a change of +21 570 %.
 *
 * This function cannot check that for you. It is named for what it needs, and
 * the caller is `getTotalNetWorthOverTime`, which passes
 * `getPortfolioValueOverTime(true)`.
 */
export function mergeNetWorthSeries(
  cash: { date: string; netWorth: number; approximate?: boolean }[],
  portfolioOnTop: { date: string; portfolioValue: number }[]
): NetWorthPoint[] {
  const dates = [
    ...new Set([...cash.map((p) => p.date), ...portfolioOnTop.map((p) => p.date)]),
  ].sort();

  const lastAtOrBefore = <T extends { date: string }>(series: T[], date: string): T | undefined => {
    let found: T | undefined;
    for (const point of series) {
      if (point.date <= date) found = point;
      else break;
    }
    return found;
  };

  const orderedCash = [...cash].sort((a, b) => a.date.localeCompare(b.date));
  const orderedPortfolio = [...portfolioOnTop].sort((a, b) => a.date.localeCompare(b.date));

  return dates.map((date) => {
    const cashPoint = lastAtOrBefore(orderedCash, date);
    const cashValue = cashPoint?.netWorth ?? 0;
    const portfolio = lastAtOrBefore(orderedPortfolio, date)?.portfolioValue ?? 0;

    return {
      date,
      netWorth: round2(cashValue + portfolio),
      cash: round2(cashValue),
      portfolio: round2(portfolio),
      // Carried through so the chart can say which points rest on a rate that
      // wasn't the rate of that day.
      approximate: cashPoint?.approximate ?? false,
    };
  });
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/** Value at or before a date, for reading a series at a point in time. */
export function valueAt(series: SeriesPoint[], date: string): number | null {
  const known = series.filter((p) => p.date <= date);
  return known.length > 0 ? known[known.length - 1].value : null;
}

/**
 * Growth over a window ending at the last point.
 *
 * Returns null rather than a number when the window reaches back further than
 * the data goes — "up 40% this year" from three weeks of history is a claim the
 * data cannot support.
 */
export function growthOverDays(
  series: SeriesPoint[],
  days: number,
  contributions?: number | null
): Growth | null {
  if (series.length < 2) return null;

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const cutoff = new Date(new Date(last.date).getTime() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  if (sorted[0].date > cutoff) return null;

  const from = valueAt(sorted, cutoff);
  if (from === null) return null;

  return growth({ from, to: last.value, contributions });
}
