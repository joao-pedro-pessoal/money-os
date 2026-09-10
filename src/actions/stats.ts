"use server";

import { db } from "@/db/client";
import { transactions, accounts, buckets, bucketAllocations, holdings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTotalNetWorthOverTime } from "./analytics";
import { getNetWorth } from "./networth";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { listBalances } from "./connections";
import { toBase } from "@/lib/fx";
import {
  periodReturns, drawdown, monthlyFlows, averageSavingsRate,
  concentration, runway, project, monthsToGoal,
} from "@/lib/stats";

/** Everything the statistics page needs, in the base currency. */
export async function getStatistics() {
  const [series, nw, tx, rates, base, allAccounts, allBuckets, allocations, allHoldings, syncedBalances] =
    await Promise.all([
      getTotalNetWorthOverTime(),
      getNetWorth(),
      db.select().from(transactions),
      getRates(),
      getBaseCurrency(),
      db.select().from(accounts).where(eq(accounts.active, true)),
      db.select().from(buckets),
      db.select().from(bucketAllocations),
      db.select().from(holdings),
      listBalances(),
    ]);

  const points = series.map((p) => ({ date: p.date, value: p.netWorth }));

  /**
   * Transactions converted before they are grouped, not after.
   *
   * `transactions.currency` was read off the row and thrown away here, so every
   * figure downstream — the monthly flows, the savings rate, the average
   * expenses, the runway and both projections — added dollars to euros. It was
   * the last unconverted sum in the app and it survived because this half has
   * never been used in anger: with no transactions on file, nothing on the
   * screen was visibly wrong. The first expense in another currency would have
   * been the test.
   *
   * A transaction with no rate is dropped and counted, never converted to zero:
   * a spend that vanishes flatters the month it was in.
   */
  const convertible: { date: string; amount: number; type: string }[] = [];
  const missingRateFor = new Set<string>();
  for (const t of tx) {
    const amount = toBase(Number(t.amount), t.currency, rates, base);
    if (amount === null) {
      missingRateFor.add(t.currency);
      continue;
    }
    convertible.push({
      date: new Date(t.date).toISOString().slice(0, 10),
      amount,
      type: t.type,
    });
  }
  const flows = monthlyFlows(convertible);

  // The last three complete months are a fairer basis than one month, which
  // any single large purchase would distort.
  const recent = flows.slice(-3);
  const avgMonthlyExpenses =
    recent.length > 0 ? round2(recent.reduce((s, f) => s + f.expenses, 0) / recent.length) : 0;
  const avgMonthlySaving =
    recent.length > 0 ? round2(recent.reduce((s, f) => s + f.net, 0) / recent.length) : 0;

  /**
   * Null, not zero, when there is no rate.
   *
   * This used to end in `?? 0`, which is the shape the rest of the codebase
   * bans: an unconvertible balance became a row worth nothing and then vanished
   * through the `value > 0` filter below, quietly shrinking the concentration
   * denominator. The callers drop it explicitly now, and record the currency.
   */
  const convert = (amount: number, currency: string) => {
    const converted = toBase(amount, currency, rates, base);
    if (converted === null) missingRateFor.add(currency);
    return converted;
  };
  const currencyOfAccount = new Map(allAccounts.map((a) => [a.id, a.currency]));

  const priced = (rows: { name: string; value: number | null }[]) =>
    rows.flatMap((r) => (r.value === null || r.value <= 0 ? [] : [{ name: r.name, value: r.value }]));

  const byAccount = priced(
    allAccounts.map((a) => ({ name: a.name, value: convert(Number(a.balance), a.currency) }))
  );

  const byPosition = priced([
    ...allHoldings.map((h) => ({
      name: h.symbol,
      value: convert(Number(h.quantity) * Number(h.currentPrice), h.currency),
    })),
    // The platform's own currency, which travels with the balance now. Reading
    // a Trading 212 euro balance as dollars understated it by about 15 %.
    ...syncedBalances.map((b) => ({ name: b.coin, value: convert(b.usdValue ?? 0, b.currency) })),
  ]);

  const bucketProgress = allBuckets
    .filter((b) => b.targetAmount !== null && Number(b.targetAmount) > 0)
    .map((b) => {
      /**
       * Allocations live on accounts, and accounts have currencies.
       *
       * Summing them raw compared a mixed-currency figure against a target in
       * one currency, so a bucket fed from a dollar account reported the wrong
       * progress — and the "months to goal" built on it inherited the error.
       */
      /**
       * An allocation with no rate is left out of the progress, not counted as
       * zero — the two are the same arithmetic here, but `convert` has recorded
       * the currency on its way past, so the page names what is missing instead
       * of showing a short bar with no explanation.
       */
      const current = allocations
        .filter((a) => a.bucketId === b.id)
        .reduce((s, a) => {
          const value = convert(Number(a.amount), currencyOfAccount.get(a.accountId) ?? base);
          return value === null ? s : s + value;
        }, 0);
      const target = Number(b.targetAmount);
      return {
        id: b.id,
        name: b.name,
        current: round2(current),
        target,
        percent: round2(Math.min(100, (current / target) * 100)),
        months: monthsToGoal(current, target, avgMonthlySaving),
      };
    });

  return {
    baseCurrency: base,
    /**
     * Currencies with no rate, gathered from every conversion above. Amounts in
     * these are left out of the figures rather than counted as base currency,
     * and the page says so — the same contract as the subscriptions and
     * liabilities screens.
     */
    unconverted: [...missingRateFor].sort(),
    netWorth: nw,
    returns: periodReturns(points),
    drawdown: drawdown(points),
    historyPoints: points.length,
    flows,
    avgSavingsRate: averageSavingsRate(flows),
    avgMonthlyExpenses,
    avgMonthlySaving,
    runwayMonths: runway(nw.cash, avgMonthlyExpenses),
    concentrationByAccount: concentration(byAccount),
    concentrationByPosition: concentration(byPosition),
    projections: project(nw.total, avgMonthlySaving, 5),
    projectionsOptimistic: project(nw.total, avgMonthlySaving, 8),
    bucketProgress,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
