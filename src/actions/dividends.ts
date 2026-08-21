"use server";

import { db } from "@/db/client";
import { dividendPayments, accounts, positions, accountConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  summariseByTicker,
  summariseByYear,
  upcomingEstimates,
  trailingYield,
  totalReceived,
  isInterest,
  type DividendPayment,
} from "@/lib/portfolio/dividends";
import { attribute } from "@/lib/portfolio/attribution";

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
  const payments = await loadPayments();

  const distributions = payments.filter((p) => !isInterest(p.type));
  const interest = payments.filter((p) => isInterest(p.type));

  const byTicker = summariseByTicker(distributions);

  // Current value per ticker, for a trailing yield. Only synced positions have
  // one; anything else reports no yield rather than a made-up denominator.
  const openPositions = await db.select().from(positions);
  const valueByTicker = new Map<string, number>();
  for (const p of openPositions) {
    if (p.positionValue === null) continue;
    valueByTicker.set(p.coin, (valueByTicker.get(p.coin) ?? 0) + Number(p.positionValue));
  }

  return {
    totalAll: totalReceived(payments),
    totalDistributions: totalReceived(distributions),
    totalInterest: totalReceived(interest),
    currency: payments[0]?.currency ?? "EUR",
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
  const [payments, connections] = await Promise.all([
    loadPayments(),
    db.select().from(accountConnections),
  ]);

  const dividends = totalReceived(payments.filter((p) => !isInterest(p.type)));
  const interest = totalReceived(payments.filter((p) => isInterest(p.type)));

  const reported = connections
    .map((c) => c.lastRealizedPnl)
    .filter((v): v is string => v !== null)
    .map(Number);
  const trades = reported.length === 0 ? null : reported.reduce((s, v) => s + v, 0);

  return {
    trades,
    dividends,
    interest,
    total: Math.round(((trades ?? 0) + dividends + interest + Number.EPSILON) * 100) / 100,
    tradesUnknown: trades === null,
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
  const [payments, openPositions, connections] = await Promise.all([
    loadPayments(),
    db.select().from(positions),
    db.select().from(accountConnections),
  ]);

  const unrealised = openPositions.reduce(
    (s, p) => s + (p.unrealizedPnl === null ? 0 : Number(p.unrealizedPnl)),
    0
  );

  const reported = connections
    .map((c) => c.lastRealizedPnl)
    .filter((v): v is string => v !== null)
    .map(Number);

  return {
    attribution: attribute({
      unrealised,
      realisedTrades: reported.length === 0 ? null : reported.reduce((s, v) => s + v, 0),
      dividends: totalReceived(payments.filter((p) => !isInterest(p.type))),
      interest: totalReceived(payments.filter((p) => isInterest(p.type))),
    }),
    /** Which platforms answered, so the interface can name what's missing. */
    reportingPlatforms: connections.filter((c) => c.lastRealizedPnl !== null).map((c) => c.platform),
    silentPlatforms: connections.filter((c) => c.lastRealizedPnl === null).map((c) => c.platform),
  };
}
