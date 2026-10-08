"use server";

import { db } from "@/db/client";
import {
  dividendPayments,
  accounts,
  positions,
  accountConnections,
  brokerEvents,
  holdings,
  investmentActivities,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { incomeForecast, upcomingDividends } from "@/lib/portfolio/dividendCalendar";
import { getAnnouncedDividends, heldSymbols } from "./exposure";
import {
  summariseByTicker,
  summariseByYear,
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
import { getRealisedTrades } from "./investmentActivity";
import { getPortfolioItems } from "./dashboard";
import { portfolioSummary } from "@/lib/portfolio/positionView";

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
  const [loaded, fx, announced, held] = await Promise.all([
    loadPayments(),
    converter(),
    getAnnouncedDividends(),
    heldSymbols(),
  ]);
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
    /**
     * The next dividend per instrument: the company's announced date while it
     * is still ahead, else the estimate from your own payments' rhythm — each
     * labelled with which it is. The widget reads this same list.
     */
    upcoming: upcomingDividends(byTicker, announced),
    /**
     * What the payers still held paid over the last twelve months, in the base
     * currency: the next twelve months if nothing changes. Rows no rate could
     * convert are left out, like everywhere else.
     */
    forecast: incomeForecast(
      distributions.flatMap((p) => {
        const amount = fx.convert(p.amount, p.currency);
        return amount === null ? [] : [{ ticker: p.ticker, instrumentName: p.instrumentName ?? null, paidOn: p.paidOn, amount }];
      }),
      held
    ),
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
 * Every dividend and interest credit, converted, for a report to cut at its
 * own two days. The same payments the page above totals, from the same sources,
 * so a report over all time and the page cannot differ.
 */
export async function getIncomePayments() {
  const [loaded, fx] = await Promise.all([loadPayments(), converter()]);
  // The days of the ones no rate could convert, so a report counts only its own period's.
  const unconvertedDates: string[] = [];
  const payments = loaded.counted.flatMap((p) => {
    const amount = fx.convert(p.amount, p.currency);
    if (amount === null) {
      unconvertedDates.push(p.paidOn.toISOString().slice(0, 10));
      return [];
    }
    return [
      {
        date: p.paidOn.toISOString().slice(0, 10),
        kind: isInterest(p.type) ? ("interest" as const) : ("dividend" as const),
        instrument: isInterest(p.type) ? p.accountName : p.ticker,
        amount,
      },
    ];
  });
  return { payments, unconverted: fx.unconverted(), unconvertedDates };
}

/**
 * Everything realised: sales closed, dividends paid, interest credited.
 *
 * All three are money that arrived and stayed. Reporting only closed sales
 * left the card at "0,00 €" for an account that had genuinely been paid — and
 * a zero reads as a measurement rather than as a missing category.
 */
export async function getRealisedTotal() {
  const [loaded, trades, manual, fx] = await Promise.all([
    loadPayments(),
    getRealisedTrades(),
    db.select().from(holdings),
    converter(),
  ]);

  const payments = loaded.counted;
  const dividends = fx.sum(payments.filter((p) => !isInterest(p.type)));
  const interest = fx.sum(payments.filter((p) => isInterest(p.type)));
  // Sales recorded on positions you keep yourself, each in its own currency.
  // Investments used to add these unconverted.
  const manualSales = fx.sum(
    manual
      .filter((h) => h.realizedPnl !== null && Number(h.realizedPnl) !== 0)
      .map((h) => ({ amount: Number(h.realizedPnl), currency: h.currency }))
  );

  return {
    /** Closed trades, as `realisedTradeTotal` counts them; null when nothing says. */
    trades: trades.known ? trades.total : null,
    tradesReported: trades.reported,
    tradesDerived: trades.derived,
    tradesUnknown: !trades.known,
    silentPlatforms: trades.silentPlatforms,
    manualSales,
    dividends,
    interest,
    total: Math.round((trades.total + manualSales + dividends + interest + Number.EPSILON) * 100) / 100,
    /** Everything above is in this currency, and now genuinely is. */
    currency: fx.base,
    /** Figures left out because nothing could convert them. */
    unconverted: fx.unconverted() + trades.unconverted,
  };
}

/**
 * Where the portfolio's gains and losses actually came from.
 *
 * Four sources, kept apart because they behave differently — see
 * lib/portfolio/attribution. Both halves use the same arbiters as Investments:
 * getRealisedTotal for money received and portfolioSummary for open gains.
 */
export async function getGainAttribution() {
  const [realised, portfolio] = await Promise.all([
    getRealisedTotal(),
    getPortfolioItems(),
  ]);
  const summary = portfolioSummary(portfolio.items);

  // The same realised figures as the Realized P&L cards: one answer, three screens.
  // Manual sales are closed trades too, recorded by hand.
  return {
    attribution: attribute({
      unrealised: summary.pnl,
      realisedTrades: realised.tradesUnknown && realised.manualSales === 0 ? null : (realised.trades ?? 0) + realised.manualSales,
      dividends: realised.dividends,
      interest: realised.interest,
    }),
    /** Everything in the attribution is in this currency. */
    currency: portfolio.baseCurrency,
    costUnknown: summary.costUnknown,
    unconverted: realised.unconverted,
    /** Platforms that said nothing about closed trades, so the interface can name what's missing. */
    silentPlatforms: realised.silentPlatforms,
  };
}
