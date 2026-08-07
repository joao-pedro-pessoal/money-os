"use server";

import { db } from "@/db/client";
import { accounts, positions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { getPortfolioContribution } from "./investments";
import { sumInBase } from "@/lib/fx";
import { computeNetWorth, type NetWorthResult } from "@/lib/accounting/networth";

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

  // Positions are reported by the exchange in USD.
  const { total: openPositionValue } = sumInBase(
    openPositions.map((p) => ({
      amount: p.positionValue === null ? 0 : Number(p.positionValue),
      currency: "USD",
    })),
    rates,
    base
  );

  const result = computeNetWorth({
    cash,
    // getPortfolioContribution already merges manual holdings and synced spot,
    // both converted, so the split is reported rather than recomputed here.
    manualPortfolio: portfolio.portfolioValue - portfolio.syncedValue,
    syncedPortfolio: portfolio.syncedValue,
    openPositionValue,
    floatingPortfolio: portfolio.floating,
    unconverted: [...cashUnconverted, ...portfolio.unconverted],
  });

  return { ...result, baseCurrency: base };
}
