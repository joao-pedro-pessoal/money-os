"use server";
import { requireInvestments } from "./releaseEdition";

import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { symbolNames, watchlistItems } from "@/db/schema";
import { cleanSymbol, cleanSymbolName, symbolsToName, type SymbolNames } from "@/lib/portfolio/symbolNames";
import { hasSession } from "./session";
import { getPortfolioItems } from "./dashboard";
import { getTradeAnalysis } from "./investmentActivity";

/** Read once per request: the layout, the widget and a report may all ask. */
const loadNames = cache(async (): Promise<SymbolNames> => {
  const rows = await db.select({ symbol: symbolNames.symbol, name: symbolNames.name }).from(symbolNames);
  return Object.fromEntries(rows.map((r) => [r.symbol, r.name]));
});

/** Your names for tickers, symbol → name. */
export async function getSymbolNames(): Promise<SymbolNames> {
  return loadNames();
}

/** Names a ticker, or with an empty name, forgets the name it had. */
export async function setSymbolName(formData: FormData): Promise<void> {
  await requireInvestments();
  if (!(await hasSession())) throw new Error("Sign in again.");
  const symbol = cleanSymbol(String(formData.get("symbol") ?? ""));
  const name = cleanSymbolName(String(formData.get("name") ?? ""));
  if (name === null) {
    await db.delete(symbolNames).where(eq(symbolNames.symbol, symbol));
  } else {
    // A bound on what one account can store: more names than anyone holds instruments.
    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(symbolNames);
    if ((count?.n ?? 0) >= 500) throw new Error("You can name up to 500 tickers.");
    await db
      .insert(symbolNames)
      .values({ symbol, name })
      .onConflictDoUpdate({ target: [symbolNames.userId, symbolNames.symbol], set: { name, updatedAt: new Date() } });
  }
  revalidatePath("/", "layout");
}

/** Every symbol you hold, have traded or watch, with the name you gave it, for Settings. */
export async function listSymbolsToName() {
  const [{ items }, trades, watched, names] = await Promise.all([
    getPortfolioItems(),
    getTradeAnalysis(),
    db.select({ symbol: watchlistItems.symbol }).from(watchlistItems),
    loadNames(),
  ]);
  return symbolsToName({
    held: items.map((i) => i.symbol),
    traded: trades.rows.map((r) => r.symbol ?? ""),
    watched: watched.map((w) => w.symbol),
  }).map((s) => ({ ...s, name: names[s.symbol] ?? null }));
}
