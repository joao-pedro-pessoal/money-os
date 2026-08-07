"use server";

import { db } from "@/db/client";
import { holdings, holdingSnapshots, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { marketValue, costBasis, unrealizedPnL, unrealizedPnLPercent, portfolioTotals } from "@/lib/portfolio";

/** "" from an unselected <select> becomes NULL instead of an empty string in the DB. */
function tagValue(formData: FormData, field: string): string | null {
  const v = String(formData.get(field) ?? "").trim();
  return v === "" ? null : v;
}

export async function listHoldingsWithPnL() {
  const rows = await db.select().from(holdings);
  const parsed = rows.map((h) => ({
    ...h,
    quantity: Number(h.quantity),
    avgEntryPrice: Number(h.avgEntryPrice),
    currentPrice: Number(h.currentPrice),
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
  const platform = String(formData.get("platform") ?? "").trim();
  const quantity = String(formData.get("quantity") ?? "0");
  const avgEntryPrice = String(formData.get("avgEntryPrice") ?? "0");
  const currentPrice = String(formData.get("currentPrice") ?? formData.get("avgEntryPrice") ?? "0");
  const currency = String(formData.get("currency") ?? "EUR");
  const riskLevel = tagValue(formData, "riskLevel");
  const expectedReturn = tagValue(formData, "expectedReturn");
  const timeHorizon = tagValue(formData, "timeHorizon");
  const liquidity = tagValue(formData, "liquidity");

  if (!symbol || !platform) throw new Error("Symbol and platform are required");

  const [h] = await db
    .insert(holdings)
    .values({
      symbol,
      name,
      platform,
      quantity,
      avgEntryPrice,
      currentPrice,
      currency,
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
    details: JSON.stringify({ symbol, platform, quantity, avgEntryPrice }),
  });

  revalidatePath("/investments");
}

/** Edit static details (symbol, name, platform, quantity, avg entry) without touching current price. */
export async function updateHolding(formData: FormData) {
  const id = String(formData.get("id"));
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "").trim();
  const quantity = String(formData.get("quantity") ?? "0");
  const avgEntryPrice = String(formData.get("avgEntryPrice") ?? "0");
  const currency = String(formData.get("currency") ?? "EUR");
  const riskLevel = tagValue(formData, "riskLevel");
  const expectedReturn = tagValue(formData, "expectedReturn");
  const timeHorizon = tagValue(formData, "timeHorizon");
  const liquidity = tagValue(formData, "liquidity");

  if (!symbol || !platform) throw new Error("Symbol and platform are required");

  await db
    .update(holdings)
    .set({
      symbol,
      name,
      platform,
      quantity,
      avgEntryPrice,
      currency,
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
