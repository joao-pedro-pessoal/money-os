"use server";

import { db } from "@/db/client";
import { accounts, accountSnapshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPortfolioValueOverTime } from "./investments";

/**
 * Net worth over time, derived from AccountSnapshot history (MVP_SPEC.md §3/§9).
 * Snapshots are sparse and per-account (taken on creation + every manual balance
 * update), so we build a step function: for every distinct date that has at
 * least one snapshot anywhere, sum each account's most recent known balance
 * at or before that date (carry-forward).
 */
export async function getNetWorthOverTime() {
  const allAccounts = await db.select().from(accounts).where(eq(accounts.active, true));
  const allSnapshots = await db.select().from(accountSnapshots);

  if (allAccounts.length === 0) return [];

  const byAccount = new Map<string, { date: string; balance: number }[]>();
  for (const acc of allAccounts) {
    byAccount.set(
      acc.id,
      allSnapshots
        .filter((s) => s.accountId === acc.id)
        .map((s) => ({ date: new Date(s.timestamp).toISOString().slice(0, 10), balance: Number(s.balance) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  const allDates = Array.from(
    new Set(allSnapshots.map((s) => new Date(s.timestamp).toISOString().slice(0, 10)))
  ).sort();

  if (allDates.length === 0) return [];

  return allDates.map((date) => {
    let total = 0;
    for (const acc of allAccounts) {
      const points = byAccount.get(acc.id) ?? [];
      const known = points.filter((p) => p.date <= date);
      total += known.length > 0 ? known[known.length - 1].balance : 0;
    }
    return { date, netWorth: Math.round(total * 100) / 100 };
  });
}

export async function getMoneyByLocation() {
  const allAccounts = await db.select().from(accounts).where(eq(accounts.active, true));
  return allAccounts.map((a) => ({ name: a.name, value: Number(a.balance) })).filter((a) => a.value > 0);
}

/**
 * Net worth over time including investment positions.
 *
 * Account balances are cash only, and holdings are tracked separately, so the
 * two series can simply be added — there is no overlap to double count. Both
 * are carry-forward step functions, so we union the dates and carry each side
 * forward independently before summing.
 */
export async function getTotalNetWorthOverTime() {
  const [cashSeries, portfolioSeries] = await Promise.all([
    getNetWorthOverTime(),
    getPortfolioValueOverTime(),
  ]);

  const allDates = Array.from(
    new Set([...cashSeries.map((p) => p.date), ...portfolioSeries.map((p) => p.date)])
  ).sort();

  const lastAtOrBefore = <T extends { date: string }>(series: T[], date: string): T | undefined => {
    const known = series.filter((p) => p.date <= date);
    return known.length > 0 ? known[known.length - 1] : undefined;
  };

  return allDates.map((date) => {
    const cash = lastAtOrBefore(cashSeries, date)?.netWorth ?? 0;
    const portfolio = lastAtOrBefore(portfolioSeries, date)?.portfolioValue ?? 0;
    return {
      date,
      netWorth: Math.round((cash + portfolio + Number.EPSILON) * 100) / 100,
      cash: Math.round((cash + Number.EPSILON) * 100) / 100,
      portfolio: Math.round((portfolio + Number.EPSILON) * 100) / 100,
    };
  });
}
