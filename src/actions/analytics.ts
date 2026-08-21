"use server";

import { db } from "@/db/client";
import { accounts, accountSnapshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPortfolioValueOverTime } from "./investments";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { toBase } from "@/lib/fx";
import { seriesFromSnapshots, type SnapshotRow } from "@/lib/fx/historical";
import { mergeNetWorthSeries } from "@/lib/accounting/composition";

/**
 * Net worth over time, from the frozen conversions on each snapshot.
 *
 * This function used to sum `balance` straight from the rows, which meant a
 * dollar account's balance was added to a euro account's as if they were the
 * same currency. Now every snapshot carries the value it had in the base
 * currency at the moment it was taken, and the series simply adds those up.
 *
 * Snapshots are sparse — they exist only on days a balance changed — so each
 * account's last known value is carried forward.
 */
export async function getNetWorthOverTime() {
  const [allAccounts, allSnapshots, rates, base] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)),
    db.select().from(accountSnapshots),
    getRates(),
    getBaseCurrency(),
  ]);

  if (allAccounts.length === 0) return [];

  const active = new Set(allAccounts.map((a) => a.id));
  const currencyOf = new Map(allAccounts.map((a) => [a.id, a.currency]));

  const rows: SnapshotRow[] = allSnapshots
    .filter((s) => active.has(s.accountId))
    .map((s) => ({
      accountId: s.accountId,
      timestamp: new Date(s.timestamp),
      balance: Number(s.balance),
      // Older rows predate the currency column; the account's own currency is
      // the best available answer for them.
      currency: s.currency ?? currencyOf.get(s.accountId) ?? null,
      valueInBase: s.valueInBase,
      rate: s.rate,
      baseCurrency: s.baseCurrency ?? base,
      backfilled: s.backfilled || s.valueInBase === null,
    }));

  const series = seriesFromSnapshots(rows, (currency) => toBase(1, currency, rates, base));

  return series.map((p) => ({ date: p.date, netWorth: p.value, approximate: p.approximate }));
}

/**
 * Where the money sits, in one currency.
 *
 * This used to return raw balances, so a euro account and a dollar account were
 * added together as if they were the same money — the chart's total came out at
 * 705 against a net worth of 694, and nothing on the page could explain the
 * difference because the difference was an exchange rate.
 */
export async function getMoneyByLocation() {
  const [allAccounts, rates, base] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)),
    getRates(),
    getBaseCurrency(),
  ]);

  return allAccounts
    .map((a) => ({
      name: a.name,
      // Dropped rather than counted raw when there is no rate: a wrong slice
      // is harder to notice than a missing one.
      value: toBase(Number(a.balance), a.currency, rates, base) ?? 0,
    }))
    .filter((a) => a.value > 0);
}

/**
 * Net worth over time, including the investments that aren't already in a
 * balance.
 *
 * The previous version of this comment claimed "account balances are cash only,
 * so the two series can simply be added — there is no overlap to double count."
 * That stopped being true the day an account could declare that its balance
 * already contains its positions, and nothing here noticed. A Trading 212
 * balance holding €145 of ETFs was added to a portfolio series containing the
 * same €145, so the line ran at nearly three times the truth and reported
 * +21 570 %.
 *
 * The live figure has been protected against this since the fourth time it
 * happened, by `computeNetWorth`. The fix is to make the history obey the same
 * rule: only what genuinely sits outside the balances gets added on top.
 */
export async function getTotalNetWorthOverTime() {
  const [cashSeries, portfolioSeries] = await Promise.all([
    getNetWorthOverTime(),
    // true: only holdings that add on top of a balance, never positions that
    // are already inside one.
    getPortfolioValueOverTime(true),
  ]);

  // The merge itself is pure and tested in src/lib/accounting/composition.ts,
  // where the rule about what may be added on top is written down.
  return mergeNetWorthSeries(cashSeries, portfolioSeries);
}
