"use server";

import { db } from "@/db/client";
import { dividendPayments, accounts, positions, accountConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  summariseByTicker,
  summariseByYear,
  upcomingEstimates,
  trailingYield,
  isInterest,
  type DividendPayment,
} from "@/lib/portfolio/dividends";
import { attribute } from "@/lib/portfolio/attribution";
import { toBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";

/**
 * Everything realised, converted before anything is added.
 *
 * Every figure on this page arrives in the currency its source reports in:
 * Hyperliquid answers in dollars, Trading 212 in euros, and a dividend is in
 * whatever the issuer paid. They were being summed raw and rendered with the
 * base currency's symbol — so -5.93 US$ of closed trades displayed as -5,93 €,
 * a real amount of the wrong money, off by the exchange rate.
 *
 * This is the ninth place that bug has been fixed. The question when adding a
 * sum here is never "are these the same currency" but "what converts them".
 *
 * A figure with no available rate is left out and counted, never treated as
 * zero: dropping it silently understates the total, and zeroing it asserts
 * something that was never measured.
 */
async function converter() {
  const [rates, base] = await Promise.all([getRates(), getBaseCurrency()]);
  let missing = 0;

  const convert = (amount: number, currency: string): number | null => {
    const value = toBase(amount, currency, rates, base);
    if (value === null) missing += 1;
    return value;
  };

  /** Sum of what could be converted. */
  const sum = (items: readonly { amount: number; currency: string }[]): number => {
    let total = 0;
    for (const item of items) {
      const value = convert(item.amount, item.currency);
      if (value !== null) total += value;
    }
    return Math.round((total + Number.EPSILON) * 100) / 100;
  };

  return { base, convert, sum, unconverted: () => missing };
}

/** Every payment on record, newest first. */
async function loadPayments(): Promise<(DividendPayment & { accountName: string })[]> {
  const [rows, accountList] = await Promise.all([
    db.select().from(dividendPayments),
    db.select().from(accounts),
  ]);
  const accountName = new Map(accountList.map((a) => [a.id, a.name]));

  return rows
    .map((r) => ({
      ticker: r.ticker,
      instrumentName: r.instrumentName,
      paidOn: r.paidOn,
      amount: Number(r.amount),
      currency: r.currency,
      quantity: r.quantity === null ? null : Number(r.quantity),
      grossPerShare: r.grossPerShare === null ? null : Number(r.grossPerShare),
      type: r.type,
      accountName: accountName.get(r.accountId) ?? "(unknown account)",
    }))
    .sort((a, b) => b.paidOn.getTime() - a.paidOn.getTime());
}

/**
 * Everything the dividends page needs.
 *
 * Interest on cash is kept apart from distributions on instruments. Both are
 * income, but only one tells you anything about what a holding yields, and
 * adding them together would make an idle-cash balance look like a dividend
 * payer.
 */
export async function getDividendOverview() {
  const [payments, fx] = await Promise.all([loadPayments(), converter()]);

  const distributions = payments.filter((p) => !isInterest(p.type));
  const interest = payments.filter((p) => isInterest(p.type));

  const byTicker = summariseByTicker(distributions);

  // Current value per ticker, for a trailing yield. Only synced positions have
  // one; anything else reports no yield rather than a made-up denominator.
  // Converted first: a euro position's value added to a dollar one's would make
  // the denominator wrong and the yield wrong with it.
  const [openPositions, connections] = await Promise.all([
    db.select().from(positions),
    db.select().from(accountConnections),
  ]);
  const positionCurrency = new Map(connections.map((c) => [c.id, c.reportingCurrency ?? "USD"]));
  const valueByTicker = new Map<string, number>();
  for (const p of openPositions) {
    if (p.positionValue === null) continue;
    const value = fx.convert(
      Number(p.positionValue),
      positionCurrency.get(p.connectionId) ?? "USD"
    );
    if (value === null) continue;
    valueByTicker.set(p.coin, (valueByTicker.get(p.coin) ?? 0) + value);
  }

  return {
    totalAll: fx.sum(payments),
    totalDistributions: fx.sum(distributions),
    totalInterest: fx.sum(interest),
    /**
     * The base currency, because that is what the totals above are now in.
     *
     * It used to be the first payment's currency — the whole sum labelled with
     * whichever row happened to sort first, which was right only while every
     * payment shared a currency.
     */
    currency: fx.base,
    byYear: summariseByYear(distributions),
    byTicker: byTicker.map((t) => ({
      ...t,
      currentValue: valueByTicker.get(t.ticker) ?? null,
      trailingYield: trailingYield(
        distributions.filter((p) => p.ticker === t.ticker),
        valueByTicker.get(t.ticker) ?? null
      ),
    })),
    upcoming: upcomingEstimates(byTicker),
    // Distributions only. Sixty-five daily interest credits of a cent each
    // would bury the three dividends that the page is actually about; the
    // interest total is still shown above, where it belongs.
    recent: distributions.slice(0, 25),
    interestPayments: interest.length,
    hasAny: payments.length > 0,
  };
}

/** What one instrument has paid, for its own page. */
export async function getDividendsForTicker(ticker: string) {
  const payments = (await loadPayments()).filter((p) => p.ticker === ticker);
  if (payments.length === 0) return null;

  const [summary] = summariseByTicker(payments);
  const [position] = await db.select().from(positions).where(eq(positions.coin, ticker));
  const currentValue = position?.positionValue === null || position === undefined
    ? null
    : Number(position.positionValue);

  return {
    summary,
    payments,
    trailingYield: trailingYield(payments, currentValue),
    currentValue,
  };
}

export type DividendOverview = Awaited<ReturnType<typeof getDividendOverview>>;

/**
 * Everything realised: sales closed, dividends paid, interest credited.
 *
 * All three are money that arrived and stayed. Reporting only closed sales
 * left the card at "0,00 €" for an account that had genuinely been paid — and
 * a zero reads as a measurement rather than as a missing category.
 */
export async function getRealisedTotal() {
  const [payments, connections, fx] = await Promise.all([
    loadPayments(),
    db.select().from(accountConnections),
    converter(),
  ]);

  const dividends = fx.sum(payments.filter((p) => !isInterest(p.type)));
  const interest = fx.sum(payments.filter((p) => isInterest(p.type)));

  // Each platform reports in its own currency, which travels with the figure.
  const reported = connections
    .filter((c) => c.lastRealizedPnl !== null)
    .map((c) => ({
      amount: Number(c.lastRealizedPnl),
      currency: c.reportingCurrency ?? "USD",
    }));
  const trades = reported.length === 0 ? null : fx.sum(reported);

  return {
    trades,
    dividends,
    interest,
    total: Math.round(((trades ?? 0) + dividends + interest + Number.EPSILON) * 100) / 100,
    tradesUnknown: trades === null,
    /** Everything above is in this currency, and now genuinely is. */
    currency: fx.base,
    /** Figures left out because nothing could convert them. */
    unconverted: fx.unconverted(),
  };
}

/**
 * Where the portfolio's gains and losses actually came from.
 *
 * Four sources, kept apart because they behave differently — see
 * lib/portfolio/attribution. The realised trade figure is taken from whatever
 * the platforms report and is null when none of them does; it is never
 * reconstructed here, because a number we derived would disagree with the
 * broker's own and there would be no way to tell which was right.
 */
export async function getGainAttribution() {
  const [payments, openPositions, connections, fx] = await Promise.all([
    loadPayments(),
    db.select().from(positions),
    db.select().from(accountConnections),
    converter(),
  ]);

  // A position's P&L is in its platform's currency, not the app's. Summing a
  // euro position's gain onto a dollar one's was the same bug as below.
  const currencyOf = new Map(connections.map((c) => [c.id, c.reportingCurrency ?? "USD"]));
  const unrealised = fx.sum(
    openPositions
      .filter((p) => p.unrealizedPnl !== null)
      .map((p) => ({
        amount: Number(p.unrealizedPnl),
        currency: currencyOf.get(p.connectionId) ?? "USD",
      }))
  );

  const reported = connections
    .filter((c) => c.lastRealizedPnl !== null)
    .map((c) => ({
      amount: Number(c.lastRealizedPnl),
      currency: c.reportingCurrency ?? "USD",
    }));

  return {
    attribution: attribute({
      unrealised,
      realisedTrades: reported.length === 0 ? null : fx.sum(reported),
      dividends: fx.sum(payments.filter((p) => !isInterest(p.type))),
      interest: fx.sum(payments.filter((p) => isInterest(p.type))),
    }),
    /** Everything in the attribution is in this currency. */
    currency: fx.base,
    /** Which platforms answered, so the interface can name what's missing. */
    reportingPlatforms: connections.filter((c) => c.lastRealizedPnl !== null).map((c) => c.platform),
    silentPlatforms: connections.filter((c) => c.lastRealizedPnl === null).map((c) => c.platform),
  };
}
