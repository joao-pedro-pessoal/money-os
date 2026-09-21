/**
 * What an imported statement adds up to, in one currency.
 *
 * `reconstructHoldings`, the interest and dividend lists and the fee total all
 * add straight across the file. That is exact for a statement in one currency
 * and a sum of unlike things for one in two: "Still invested, at cost" was
 * euros plus dollars, labelled with whichever currency the first row was in,
 * and the page could only warn that the totals should not be read as totals.
 *
 * Here each currency is added up on its own — exactly, as before — and only
 * then converted, so a figure is never a sum of two kinds of money:
 *
 *  - **One currency:** nothing is converted. The totals are in that currency and
 *    exact, whatever the app's base currency is, which is how every statement
 *    imported so far reads.
 *  - **Several:** each currency's totals are converted into the base currency at
 *    today's rate and added, and the result is marked `converted` — approximate,
 *    like Trade history, because a purchase made last year cost what it cost at
 *    last year's rate. Each instrument and payment keeps its own currency.
 *  - **A currency with no rate** is left out of every total and named in
 *    `unconverted`, never counted as zero. Its instruments stay in the list.
 *
 * Pure.
 */

import { cumulativeHistory, summariseCashFlows, type BrokerEvent, type HistoryPoint } from "../csv/broker";
import { toBase, type RateMap } from "../fx";
import { gainAgainstCost, reconstructHoldings, type GainAgainstCost, type ReconstructedHolding } from "./reconstruct";

type StatementEvent = BrokerEvent & { isin?: string | null };

export interface StatementPayment {
  date: string;
  amount: number;
  currency: string;
  description: string | null;
  symbol: string | null;
}

export interface StatementSummary {
  /** The currency of every total below. */
  currency: string;
  /** Every currency in the file. */
  currencies: string[];
  /** True when the totals were converted at today's rate, so are approximate. */
  converted: boolean;
  /** Currencies with no exchange rate: left out of every total, and named. */
  unconverted: string[];
  flows: { deposits: number; withdrawals: number; net: number };
  /** One row per instrument, in the currency it was traded in. */
  holdings: (ReconstructedHolding & { currency: string })[];
  stillInvested: number;
  /** This app's calculation, by average cost. See `reconstruct.ts`. */
  realizedPnl: number;
  interest: { payments: StatementPayment[]; total: number };
  dividends: { payments: StatementPayment[]; total: number };
  fees: number;
  /**
   * Value today against cost, where accounts declare a value. Null when none
   * does, when a declaration could not be converted, or when the cost itself
   * leaves a currency out — a gain against part of the cost would be invented.
   */
  gain: GainAgainstCost | null;
  lastEventDate: Date | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const sum = (values: readonly number[]) => values.reduce((s, v) => s + v, 0);

/** The currency a statement's totals are in: its own when it has one, else the base. */
function totalsCurrency(currencies: readonly string[], base: string): string {
  return currencies.length === 1 ? currencies[0] : base;
}

function payments(events: readonly StatementEvent[], kind: "INTEREST" | "DIVIDEND"): StatementPayment[] {
  return events
    .filter((e) => e.kind === kind)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      amount: e.amount,
      currency: e.currency,
      description: e.description,
      symbol: e.symbol,
    }));
}

/** Fees on trades plus fees booked on their own, in the file's own terms. */
function feesOf(events: readonly StatementEvent[]): number {
  return sum(events.map((e) => (e.fees ?? 0) + (e.kind === "FEE" ? Math.abs(e.amount) : 0)));
}

/**
 * `declared` is what the accounts behind the statement say their investments
 * are worth, each in the account's currency; null or empty when none says.
 */
export function summariseStatement(
  events: readonly StatementEvent[],
  rates: RateMap,
  base: string,
  declared: readonly { amount: number; currency: string }[] | null
): StatementSummary {
  const currencies = [...new Set(events.map((e) => e.currency))].sort();
  const currency = totalsCurrency(currencies, base);
  const into = (amount: number, from: string) => toBase(amount, from, rates, currency);

  const unconverted: string[] = [];
  const holdings: StatementSummary["holdings"] = [];
  const totals = { deposits: 0, withdrawals: 0, stillInvested: 0, realizedPnl: 0, interest: 0, dividends: 0, fees: 0 };

  for (const from of currencies) {
    const group = events.filter((e) => e.currency === from);
    const rebuilt = reconstructHoldings(group);
    holdings.push(...rebuilt.holdings.map((h) => ({ ...h, currency: from })));

    // Added up in their own currency first — exact — and converted once.
    const flows = summariseCashFlows(group);
    const own = {
      deposits: flows.deposits ?? 0,
      withdrawals: flows.withdrawals ?? 0,
      stillInvested: rebuilt.totalCostBasis,
      realizedPnl: rebuilt.totalRealizedPnl,
      interest: sum(payments(group, "INTEREST").map((p) => p.amount)),
      dividends: sum(payments(group, "DIVIDEND").map((p) => p.amount)),
      fees: feesOf(group),
    };
    if (into(1, from) === null) {
      unconverted.push(from);
      continue;
    }
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[key] += into(own[key], from) ?? 0; // never null: the rate was checked above
    }
  }

  const stillInvested = round2(totals.stillInvested);
  const declaredInCurrency = (declared ?? []).map((d) => into(d.amount, d.currency));
  const gain =
    declaredInCurrency.length === 0 || declaredInCurrency.some((v) => v === null) || unconverted.length > 0
      ? null
      : gainAgainstCost(round2(sum(declaredInCurrency as number[])), stillInvested);

  const dates = events.map((e) => e.date.getTime());

  return {
    currency,
    currencies,
    converted: currencies.some((c) => c !== currency),
    unconverted,
    flows: {
      deposits: round2(totals.deposits),
      withdrawals: round2(totals.withdrawals),
      net: round2(totals.deposits - totals.withdrawals),
    },
    holdings,
    stillInvested,
    realizedPnl: round2(totals.realizedPnl),
    interest: { payments: payments(events, "INTEREST"), total: round2(totals.interest) },
    dividends: { payments: payments(events, "DIVIDEND"), total: round2(totals.dividends) },
    fees: round2(totals.fees),
    gain,
    lastEventDate: dates.length > 0 ? new Date(Math.max(...dates)) : null,
  };
}

export interface StatementHistory {
  history: HistoryPoint[];
  currency: string;
  converted: boolean;
  unconverted: string[];
}

/**
 * The statement's running totals over time, in one currency.
 *
 * The same rule as above. With several currencies each row is converted at
 * today's rate before it is added — approximate, and said so; a row in a
 * currency with no rate is left out of the lines and named.
 */
export function statementHistory(
  events: readonly StatementEvent[],
  rates: RateMap,
  base: string
): StatementHistory {
  const currencies = [...new Set(events.map((e) => e.currency))].sort();
  const currency = totalsCurrency(currencies, base);
  const unconverted = currencies.filter((c) => toBase(1, c, rates, currency) === null);

  const inCurrency = events.flatMap((e) => {
    if (e.currency === currency) return [e];
    const amount = toBase(e.amount, e.currency, rates, currency);
    if (amount === null) return [];
    const fees = e.fees === null ? null : toBase(e.fees, e.currency, rates, currency);
    const price = e.price === null ? null : toBase(e.price, e.currency, rates, currency);
    return [{ ...e, amount, fees, price, currency }];
  });

  return {
    history: cumulativeHistory(inCurrency),
    currency,
    converted: currencies.some((c) => c !== currency),
    unconverted,
  };
}
