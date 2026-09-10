"use server";

import { db } from "@/db/client";
import { accounts, positions, accountConnections, liabilities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { getPortfolioContribution } from "./investments";
import { sumInBase, toBase } from "@/lib/fx";
import { computeNetWorth, type NetWorthResult } from "@/lib/accounting/networth";
import { capitalAtRisk } from "@/lib/connectors/margin";

/**
 * The single source of truth for "how much do I have".
 *
 * Gathers every component, converts to the base currency, and hands the
 * composition to computeNetWorth. No page should add money figures itself —
 * if a screen needs a patrimony number, it calls this.
 */
export async function getNetWorth(): Promise<NetWorthResult & { baseCurrency: string }> {
  const [allAccounts, openPositions, rates, base, portfolio] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)),
    db.select().from(positions),
    getRates(),
    getBaseCurrency(),
    getPortfolioContribution(),
  ]);

  const { total: cash, unconverted: cashUnconverted } = sumInBase(
    allAccounts.map((a) => ({ amount: Number(a.balance), currency: a.currency })),
    rates,
    base
  );

  /**
   * Positions are reported in whatever currency the platform uses, which is not
   * always USD. Trading 212 reports euros; treating those as dollars scaled the
   * whole account by the EUR/USD rate.
   */
  const conns = await db.select().from(accountConnections);
  const currencyOf = new Map(conns.map((c) => [c.id, c.reportingCurrency ?? "USD"]));
  const { total: openPositionValue } = sumInBase(
    openPositions.map((p) => ({
      amount: p.positionValue === null ? 0 : Number(p.positionValue),
      currency: currencyOf.get(p.connectionId) ?? "USD",
    })),
    rates,
    base
  );

  /**
   * The invested half of any account that is both a bank and a broker.
   *
   * Its balance is the whole total, so it arrived in `cash` above along with
   * every other balance. This is the part of it that is not cash.
   */
  const { total: declaredInvested } = sumInBase(
    allAccounts
      .filter((a) => a.balanceMeaning === "bank_and_broker")
      .map((a) => ({
        // Never more than the account holding it: a larger figure would push
        // cash negative, and a negative cash bucket is not a thing.
        amount: Math.min(Number(a.investedValue ?? 0), Number(a.balance)),
        currency: a.currency,
      })),
    rates,
    base
  );

  /**
   * The same figures, account by account.
   *
   * Needed because reclassifying "investments already inside a balance" has to
   * be capped by the balance that holds them. Capped against the grand total,
   * Hyperliquid's leveraged notional — larger than the money backing it —
   * consumed every other account's free cash, and the dashboard reported zero
   * cash beside a Free Cash card that (correctly) showed some.
   */
  const positionValueByAccount = new Map<string, number>();
  for (const p of openPositions) {
    /**
     * Capital committed, not notional exposure.
     *
     * A leveraged position controls far more than it costs: €88 of collateral
     * can hold €400 of notional. Using the notional here meant the whole
     * account — including the stablecoins sitting free beside the trade — was
     * reclassified as invested, because the cap is the account's own balance
     * and the notional exceeded it.
     *
     * `capitalAtRisk` answers the right question: how much of your money is
     * actually behind this. Free collateral stays cash, which is what it is.
     */
    const risk = capitalAtRisk({
      positionValue: p.positionValue === null ? null : Number(p.positionValue),
      marginUsed: p.marginUsed === null ? null : Number(p.marginUsed),
      leverage: p.leverage === null ? null : Number(p.leverage),
    });

    const value =
      toBase(risk.atRisk, currencyOf.get(p.connectionId) ?? "USD", rates, base) ?? 0;
    positionValueByAccount.set(p.accountId, (positionValueByAccount.get(p.accountId) ?? 0) + value);
  }

  const insideBalances = allAccounts.map((a) => {
    const declared =
      a.balanceMeaning === "bank_and_broker"
        ? Math.min(Number(a.investedValue ?? 0), Number(a.balance))
        : 0;

    return {
      cash: toBase(Number(a.balance), a.currency, rates, base) ?? 0,
      invested:
        (positionValueByAccount.get(a.id) ?? 0) + (toBase(declared, a.currency, rates, base) ?? 0),
    };
  });

  /**
   * What is owed, converted like everything else before it is subtracted.
   *
   * Rows linked to an account are skipped on purpose: that account's balance is
   * already negative by this amount, so `cash` has taken it off once. Counting
   * it again would subtract the same debt twice — the recurring double-count of
   * this codebase, pointing the other way for once.
   */
  const liabilityRows = await db.select().from(liabilities).where(eq(liabilities.active, true));

  /**
   * Through `sumInBase`, like every other component of this figure.
   *
   * This was the one that wasn't: a raw `reduce` with `?? 0`, so a debt in a
   * currency with no rate became a debt of zero. Every asset in this function
   * that cannot be converted is left out **and named**, and the dashboard says
   * so; the liabilities quietly rounded to nothing and the headline came out
   * too high, with no marker anywhere that something was missing.
   *
   * It is the same rule pointing the other way, and the direction is what makes
   * it worse than the asset case: money you own going missing understates you,
   * money you owe going missing tells you that you are richer than you are.
   */
  const { total: owed, unconverted: owedUnconverted } = sumInBase(
    liabilityRows
      .filter((l) => l.accountId === null)
      .map((l) => ({ amount: Number(l.balance), currency: l.currency })),
    rates,
    base
  );

  const result = computeNetWorth({
    cash,
    liabilities: owed,
    declaredInvested,
    insideBalances,
    // getPortfolioContribution already merges manual holdings and synced spot,
    // both converted, so the split is reported rather than recomputed here.
    manualPortfolio: portfolio.portfolioValue - portfolio.syncedValue,
    syncedPortfolio: portfolio.syncedValue,
    openPositionValue,
    floatingPortfolio: portfolio.floating,
    unconverted: [...cashUnconverted, ...portfolio.unconverted, ...owedUnconverted],
  });

  return { ...result, baseCurrency: base };
}
