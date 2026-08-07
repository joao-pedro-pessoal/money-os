"use server";

import { db } from "@/db/client";
import { holdings, holdingSnapshots, auditLog, accounts, playlists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  marketValue,
  costBasis,
  unrealizedPnL,
  unrealizedPnLPercent,
  portfolioTotals,
  reinforcePosition,
  reducePosition,
} from "@/lib/portfolio";
import {
  breakdownBy,
  stableVsFloating,
  stakingSummary,
  topMovers,
  concentrationWarnings,
  horizonRiskMismatches,
  performanceBy,
  sortPerformance,
  type AnalysisHolding,
  type GroupByKey,
  type SortKey,
} from "@/lib/portfolio/analysis";

/** "" from an unselected <select> becomes NULL instead of an empty string in the DB. */
function tagValue(formData: FormData, field: string): string | null {
  const v = String(formData.get(field) ?? "").trim();
  return v === "" ? null : v;
}

/** Optional numeric field: blank stays NULL rather than becoming 0. */
function numericValue(formData: FormData, field: string): string | null {
  const v = String(formData.get(field) ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

export async function listHoldingsWithPnL() {
  const rows = await db.select().from(holdings);
  const [allAccounts, allPlaylists] = await Promise.all([
    db.select().from(accounts),
    db.select().from(playlists),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const playlistName = new Map(allPlaylists.map((p) => [p.id, p.name]));

  const parsed = rows.map((h) => ({
    ...h,
    quantity: Number(h.quantity),
    avgEntryPrice: Number(h.avgEntryPrice),
    currentPrice: Number(h.currentPrice),
    apr: h.apr === null ? null : Number(h.apr),
    rewardsEarned: h.rewardsEarned === null ? 0 : Number(h.rewardsEarned),
    realizedPnl: h.realizedPnl === null ? 0 : Number(h.realizedPnl),
    playlistName: h.playlistId ? playlistName.get(h.playlistId) ?? null : null,
    // Falls back to the old free-text platform for rows created before
    // holdings were linked to accounts.
    accountName: (h.accountId ? accountName.get(h.accountId) : null) ?? h.platform ?? null,
  }));

  const withPnL = parsed.map((h) => ({
    ...h,
    marketValue: marketValue(h),
    costBasis: costBasis(h),
    unrealizedPnL: unrealizedPnL(h),
    unrealizedPnLPercent: unrealizedPnLPercent(h),
  }));

  return { holdings: withPnL, totals: portfolioTotals(parsed) };
}

export async function getHolding(id: string) {
  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  return h;
}

export async function getHoldingSnapshots(holdingId: string) {
  return db.select().from(holdingSnapshots).where(eq(holdingSnapshots.holdingId, holdingId)).orderBy(holdingSnapshots.timestamp);
}

export async function createHolding(formData: FormData) {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const accountId = tagValue(formData, "accountId");
  const quantity = String(formData.get("quantity") ?? "0");
  const avgEntryPrice = String(formData.get("avgEntryPrice") ?? "0");
  const currentPrice = String(formData.get("currentPrice") ?? formData.get("avgEntryPrice") ?? "0");
  const currency = String(formData.get("currency") ?? "EUR");
  const assetType = tagValue(formData, "assetType");
  const direction = tagValue(formData, "direction") ?? "long";
  const playlistId = tagValue(formData, "playlistId");
  const apr = numericValue(formData, "apr");
  const rewardsEarned = numericValue(formData, "rewardsEarned") ?? "0";
  const riskLevel = tagValue(formData, "riskLevel");
  const expectedReturn = tagValue(formData, "expectedReturn");
  const timeHorizon = tagValue(formData, "timeHorizon");
  const liquidity = tagValue(formData, "liquidity");

  if (!symbol) throw new Error("Symbol is required");
  if (!accountId) throw new Error("Pick the account that holds this position");

  const [h] = await db
    .insert(holdings)
    .values({
      symbol,
      name,
      accountId,
      quantity,
      avgEntryPrice,
      currentPrice,
      currency,
      assetType,
      direction,
      playlistId,
      apr,
      rewardsEarned,
      riskLevel,
      expectedReturn,
      timeHorizon,
      liquidity,
      lastPriceUpdate: new Date(),
    })
    .returning();

  await db.insert(holdingSnapshots).values({
    holdingId: h.id,
    price: currentPrice,
    value: String(Number(quantity) * Number(currentPrice)),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: h.id,
    action: "holding_created",
    details: JSON.stringify({ symbol, accountId, quantity, avgEntryPrice, assetType }),
  });

  revalidatePath("/investments");
}

/** Edit static details (symbol, name, platform, quantity, avg entry) without touching current price. */
export async function updateHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const accountId = tagValue(formData, "accountId");
  const quantity = String(formData.get("quantity") ?? "0");
  const avgEntryPrice = String(formData.get("avgEntryPrice") ?? "0");
  const currency = String(formData.get("currency") ?? "EUR");
  const assetType = tagValue(formData, "assetType");
  const direction = tagValue(formData, "direction") ?? "long";
  const playlistId = tagValue(formData, "playlistId");
  const apr = numericValue(formData, "apr");
  const rewardsEarned = numericValue(formData, "rewardsEarned") ?? "0";
  const riskLevel = tagValue(formData, "riskLevel");
  const expectedReturn = tagValue(formData, "expectedReturn");
  const timeHorizon = tagValue(formData, "timeHorizon");
  const liquidity = tagValue(formData, "liquidity");

  if (!symbol) throw new Error("Symbol is required");
  if (!accountId) throw new Error("Pick the account that holds this position");

  await db
    .update(holdings)
    .set({
      symbol,
      name,
      accountId,
      quantity,
      avgEntryPrice,
      currency,
      assetType,
      direction,
      playlistId,
      apr,
      rewardsEarned,
      riskLevel,
      expectedReturn,
      timeHorizon,
      liquidity,
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
}

/** Updates the current price, recording a snapshot so the value-over-time chart has a point. */
export async function updateHoldingPrice(formData: FormData) {
  const id = String(formData.get("id"));
  const currentPrice = String(formData.get("currentPrice") ?? "0");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  await db
    .update(holdings)
    .set({ currentPrice, lastPriceUpdate: new Date(), updatedAt: new Date() })
    .where(eq(holdings.id, id));

  await db.insert(holdingSnapshots).values({
    holdingId: id,
    price: currentPrice,
    value: String(Number(h.quantity) * Number(currentPrice)),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "price_updated",
    details: JSON.stringify({ oldPrice: h.currentPrice, newPrice: currentPrice }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
}

export async function deleteHolding(formData: FormData) {
  const id = String(formData.get("id"));
  await db.insert(auditLog).values({ entityType: "holding", entityId: id, action: "holding_deleted" });
  await db.delete(holdings).where(eq(holdings.id, id));
  revalidatePath("/investments");
  redirect("/investments");
}

/**
 * Portfolio value over time, same carry-forward approach as
 * getNetWorthOverTime in analytics.ts, but scoped to holdings.
 */
export async function getPortfolioValueOverTime() {
  const allHoldings = await db.select().from(holdings);
  const allSnapshots = await db.select().from(holdingSnapshots);

  if (allHoldings.length === 0) return [];

  const byHolding = new Map<string, { date: string; value: number }[]>();
  for (const h of allHoldings) {
    byHolding.set(
      h.id,
      allSnapshots
        .filter((s) => s.holdingId === h.id)
        .map((s) => ({ date: new Date(s.timestamp).toISOString().slice(0, 10), value: Number(s.value) }))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  const allDates = Array.from(
    new Set(allSnapshots.map((s) => new Date(s.timestamp).toISOString().slice(0, 10)))
  ).sort();

  if (allDates.length === 0) return [];

  return allDates.map((date) => {
    let total = 0;
    for (const h of allHoldings) {
      const points = byHolding.get(h.id) ?? [];
      const known = points.filter((p) => p.date <= date);
      total += known.length > 0 ? known[known.length - 1].value : 0;
    }
    return { date, portfolioValue: Math.round(total * 100) / 100 };
  });
}

/** Accounts available to hold positions (active only) — used by the forms. */
export async function listAccountsForHoldings() {
  const rows = await db.select().from(accounts).where(eq(accounts.active, true));
  return rows.map((a) => ({ id: a.id, name: a.name, institution: a.institution, currency: a.currency }));
}

/** Records rewards received on a staked position, adding to the running total. */
export async function addRewards(formData: FormData) {
  const id = String(formData.get("id"));
  const amount = Number(formData.get("amount") ?? "0");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  const newTotal = Math.round((Number(h.rewardsEarned ?? 0) + amount + Number.EPSILON) * 100) / 100;
  await db
    .update(holdings)
    .set({ rewardsEarned: String(newTotal), updatedAt: new Date() })
    .where(eq(holdings.id, id));

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "rewards_added",
    details: JSON.stringify({ amount, newTotal }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments/analysis");
}

/**
 * Everything the analysis page needs, computed from the pure functions in
 * src/lib/portfolio/analysis.ts. Account names are resolved here so the
 * breakdown by wallet reads properly instead of showing raw ids.
 */
export async function getPortfolioAnalysis() {
  const { holdings: rows, totals } = await listHoldingsWithPnL();

  const enriched: AnalysisHolding[] = rows.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    quantity: h.quantity,
    avgEntryPrice: h.avgEntryPrice,
    currentPrice: h.currentPrice,
    accountId: h.accountId,
    accountName: h.accountName,
    assetType: h.assetType,
    riskLevel: h.riskLevel,
    expectedReturn: h.expectedReturn,
    timeHorizon: h.timeHorizon,
    liquidity: h.liquidity,
    apr: h.apr,
    rewardsEarned: h.rewardsEarned,
    direction: h.direction,
    playlistId: h.playlistId,
    playlistName: h.playlistName,
    realizedPnl: h.realizedPnl,
  }));

  return {
    totals,
    holdings: enriched,
    byAccount: breakdownBy(enriched, (h) => h.accountName, "No account"),
    byAssetType: breakdownBy(enriched, (h) => h.assetType),
    byRisk: breakdownBy(enriched, (h) => h.riskLevel),
    byTimeHorizon: breakdownBy(enriched, (h) => h.timeHorizon),
    byLiquidity: breakdownBy(enriched, (h) => h.liquidity),
    split: stableVsFloating(enriched),
    staking: stakingSummary(enriched),
    movers: topMovers(enriched),
    concentration: concentrationWarnings(enriched),
    mismatches: horizonRiskMismatches(enriched),
    realizedTotal:
      Math.round((enriched.reduce((s, h) => s + (h.realizedPnl ?? 0), 0) + Number.EPSILON) * 100) / 100,
  };
}

/**
 * Performance grouped by any dimension, sorted by any column — this is what
 * answers "which playlist / category is doing best?".
 */
export async function getGroupedPerformance(groupBy: GroupByKey, sortKey: SortKey, direction: "asc" | "desc") {
  const { holdings: enriched } = await getPortfolioAnalysis();
  return sortPerformance(performanceBy(enriched, groupBy), sortKey, direction);
}

/**
 * Total market value of all positions, plus the market-exposed portion.
 * Used to show Net Worth as cash + portfolio, with the floating part in
 * parentheses so it's always clear how much of it isn't guaranteed.
 */
export async function getPortfolioContribution() {
  const { holdings: rows, totals } = await listHoldingsWithPnL();
  const split = stableVsFloating(
    rows.map((h) => ({
      id: h.id,
      symbol: h.symbol,
      quantity: h.quantity,
      avgEntryPrice: h.avgEntryPrice,
      currentPrice: h.currentPrice,
      assetType: h.assetType,
    }))
  );
  return { portfolioValue: totals.totalValue, floating: split.floating, stable: split.stable };
}

/**
 * Buying more of a position. The average entry price becomes the weighted
 * average of the old and new lots (see reinforcePosition), and a snapshot is
 * recorded at the new price so the value chart stays continuous.
 */
export async function reinforceHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const addQuantity = Number(formData.get("quantity") ?? "0");
  const price = Number(formData.get("price") ?? "0");

  if (addQuantity <= 0) throw new Error("Quantity must be greater than zero");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  const next = reinforcePosition(
    { quantity: Number(h.quantity), avgEntryPrice: Number(h.avgEntryPrice) },
    { quantity: addQuantity, price }
  );

  await db
    .update(holdings)
    .set({
      quantity: String(next.quantity),
      avgEntryPrice: String(next.avgEntryPrice),
      currentPrice: String(price),
      lastPriceUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  await db.insert(holdingSnapshots).values({
    holdingId: id,
    price: String(price),
    value: String(next.quantity * price),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "position_reinforced",
    details: JSON.stringify({ addQuantity, price, newQuantity: next.quantity, newAvg: next.avgEntryPrice }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments/analysis");
}

/**
 * Selling part (or all) of a position. The average entry price is left alone —
 * only the quantity drops and the profit on the units sold moves into
 * realizedPnl, so realised money is never mixed with paper gains.
 */
export async function sellHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const sellQuantity = Number(formData.get("quantity") ?? "0");
  const price = Number(formData.get("price") ?? "0");

  if (sellQuantity <= 0) throw new Error("Quantity must be greater than zero");

  const [h] = await db.select().from(holdings).where(eq(holdings.id, id));
  if (!h) throw new Error("Holding not found");

  const next = reducePosition(
    { quantity: Number(h.quantity), avgEntryPrice: Number(h.avgEntryPrice), direction: h.direction },
    { quantity: sellQuantity, price }
  );

  const newRealized =
    Math.round((Number(h.realizedPnl ?? 0) + next.realized + Number.EPSILON) * 100) / 100;

  await db
    .update(holdings)
    .set({
      quantity: String(next.quantity),
      currentPrice: String(price),
      realizedPnl: String(newRealized),
      lastPriceUpdate: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(holdings.id, id));

  await db.insert(holdingSnapshots).values({
    holdingId: id,
    price: String(price),
    value: String(next.quantity * price),
  });

  await db.insert(auditLog).values({
    entityType: "holding",
    entityId: id,
    action: "position_sold",
    details: JSON.stringify({
      sellQuantity,
      price,
      realized: next.realized,
      remainingQuantity: next.quantity,
    }),
  });

  revalidatePath("/investments");
  revalidatePath(`/investments/${id}`);
  revalidatePath("/investments/analysis");
}
