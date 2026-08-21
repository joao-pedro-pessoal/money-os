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

  const flows = monthlyFlows(
    tx.map((t) => ({
      date: new Date(t.date).toISOString().slice(0, 10),
      amount: Number(t.amount),
      type: t.type,
    }))
  );

  // The last three complete months are a fairer basis than one month, which
  // any single large purchase would distort.
  const recent = flows.slice(-3);
  const avgMonthlyExpenses =
    recent.length > 0 ? round2(recent.reduce((s, f) => s + f.expenses, 0) / recent.length) : 0;
  const avgMonthlySaving =
    recent.length > 0 ? round2(recent.reduce((s, f) => s + f.net, 0) / recent.length) : 0;

  const convert = (amount: number, currency: string) => toBase(amount, currency, rates, base) ?? 0;
  const currencyOfAccount = new Map(allAccounts.map((a) => [a.id, a.currency]));

  const byAccount = allAccounts
    .map((a) => ({ name: a.name, value: convert(Number(a.balance), a.currency) }))
    .filter((a) => a.value > 0);

  const byPosition = [
    ...allHoldings.map((h) => ({
      name: h.symbol,
      value: convert(Number(h.quantity) * Number(h.currentPrice), h.currency),
    })),
    // The platform's own currency, which travels with the balance now. Reading
    // a Trading 212 euro balance as dollars understated it by about 15 %.
    ...syncedBalances.map((b) => ({ name: b.coin, value: convert(b.usdValue ?? 0, b.currency) })),
  ].filter((p) => p.value > 0);

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
      const current = allocations
        .filter((a) => a.bucketId === b.id)
        .reduce((s, a) => s + convert(Number(a.amount), currencyOfAccount.get(a.accountId) ?? base), 0);
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
