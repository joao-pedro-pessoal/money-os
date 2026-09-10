"use server";

import { db } from "@/db/client";
import {
  dividendPayments,
  accounts,
  positions,
  accountConnections,
  brokerEvents,
  investmentActivities,
} from "@/db/schema";
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
import {
  partitionDividends,
  nameByInstrument,
  type DividendRecord,
} from "@/lib/portfolio/dividendSource";
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

/**
 * Every payment on record, from all three places one can be recorded.
 *
 * This used to read `dividend_payments` alone, which is what a connector
 * writes. On a live account that meant thirteen Trade Republic distributions —
 * imported from a statement into `broker_events` — were invisible while the
 * page reported a confident total built from three.
 *
 * The three tables are not merged: `partitionDividends` picks one source per
 * account, because Trading 212's three payments exist in two of them on
 * identical dates and adding both would double them. See
 * `lib/portfolio/dividendSource.ts`.
 */
async function loadPayments(): Promise<{
  counted: (DividendPayment & { accountName: string })[];
  crossCheckOnly: number;
  chosenBy: ReturnType<typeof partitionDividends>["chosenBy"];
}> {
  const [rows, brokerRows, activityRows, accountList] = await Promise.all([
    db.select().from(dividendPayments),
    db.select().from(brokerEvents),
    db.select().from(investmentActivities),
    db.select().from(accounts),
  ]);
  const accountName = (id: string | null) =>
    (id === null ? undefined : accountList.find((a) => a.id === id)?.name) ?? "(unknown account)";

  /** A name for an ISIN, recovered from the purchase rows of the same import. */
  const names = nameByInstrument(brokerRows.map((r) => ({ isin: r.isin, symbol: r.symbol })));

  const records: DividendRecord[] = [
    ...rows.map((r) => ({
      accountId: r.accountId,
      accountName: accountName(r.accountId),
      source: "connector" as const,
      kind: (isInterest(r.type) ? "interest" : "distribution") as "interest" | "distribution",
      instrument: r.ticker,
      name: r.instrumentName,
      paidOn: new Date(r.paidOn).toISOString().slice(0, 10),
      amount: Number(r.amount),
      currency: r.currency,
      type: r.type,
      quantity: r.quantity === null ? null : Number(r.quantity),
      grossPerShare: r.grossPerShare === null ? null : Number(r.grossPerShare),
    })),
    ...brokerRows
      .filter((r) => r.kind === "DIVIDEND" || r.kind === "INTEREST")
      .map((r) => ({
        accountId: r.accountId,
        accountName: accountName(r.accountId),
        source: "statement" as const,
        kind: (isInterest(r.kind) ? "interest" : "distribution") as "interest" | "distribution",
        /** The ISIN where the row has no symbol, which is the usual case here. */
        instrument: r.symbol ?? r.isin ?? "(unidentified)",
        name: r.symbol ?? (r.isin === null ? null : names.get(r.isin) ?? null),
        paidOn: new Date(r.date).toISOString().slice(0, 10),
        amount: Math.abs(Number(r.amount)),
        currency: r.currency,
        type: r.kind,
        quantity: r.quantity === null ? null : Number(r.quantity),
        grossPerShare: r.price === null ? null : Number(r.price),
      })),
    ...activityRows
      .filter((r) => r.type === "DIVIDEND" || r.type === "INTEREST")
      .map((r) => ({
        accountId: r.accountId ?? "",
        accountName: accountName(r.accountId),
        source: "import" as const,
        kind: (isInterest(r.type) ? "interest" : "distribution") as "interest" | "distribution",
        instrument: r.symbol ?? "(unidentified)",
        name: r.symbol,
        paidOn: new Date(r.date).toISOString().slice(0, 10),
        amount: Math.abs(Number(r.amount)),
        currency: r.currency,
        type: r.type,
        quantity: r.quantity === null ? null : Number(r.quantity),
        grossPerShare: r.price === null ? null : Number(r.price),
      })),
  ];

  const split = partitionDividends(records);

  return {
    counted: split.counted.map((r) => ({
      ticker: r.name ?? r.instrument,
      instrumentName: r.name,
      paidOn: new Date(`${r.paidOn}T00:00:00.000Z`),
      amount: r.amount,
      currency: r.currency,
      quantity: r.quantity,
      grossPerShare: r.grossPerShare,
      type: r.type,
      accountName: r.accountName,
    })),
    crossCheckOnly: split.crossCheckOnly.length,
    chosenBy: split.chosenBy,
  };
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
  const [loaded, fx] = await Promise.all([loadPayments(), converter()]);
  const payments = loaded.counted;

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
    /**
     * Which source each account's figures came from, and how many records were
     * kept only as a cross-check. Shown rather than resolved silently: an
     * account whose statement and connector disagree is worth knowing about.
     */
    sources: loaded.chosenBy,
    crossCheckOnly: loaded.crossCheckOnly,
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
  const payments = (await loadPayments()).counted.filter((p) => p.ticker === ticker);
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
  const [loaded, connections, fx] = await Promise.all([
    loadPayments(),
    db.select().from(accountConnections),
    converter(),
  ]);

  const payments = loaded.counted;
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
  const [loaded, openPositions, connections, fx] = await Promise.all([
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
      dividends: fx.sum(loaded.counted.filter((p) => !isInterest(p.type))),
      interest: fx.sum(loaded.counted.filter((p) => isInterest(p.type))),
    }),
    /** Everything in the attribution is in this currency. */
    currency: fx.base,
    /** Which platforms answered, so the interface can name what's missing. */
    reportingPlatforms: connections.filter((c) => c.lastRealizedPnl !== null).map((c) => c.platform),
    silentPlatforms: connections.filter((c) => c.lastRealizedPnl === null).map((c) => c.platform),
  };
}
