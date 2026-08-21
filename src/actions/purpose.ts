"use server";

import { db } from "@/db/client";
import { holdingAllocations, holdings, buckets, bucketAllocations, accounts, auditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { toBase } from "@/lib/fx";
import { marketValue, costBasis } from "@/lib/portfolio";
import { STABLE_ASSET_TYPES } from "@/lib/portfolio/tags";
import {
  purposeTotals,
  goalProgress,
  sharesOfTotal,
  clampPercent,
  allocatedPercent,
  unallocatedPercent,
  isOverAllocated,
  type CashAllocation,
  type HoldingAllocation,
} from "@/lib/accounting/purpose";

/**
 * Every allocation in the app, cash and investment, converted to base.
 *
 * Loaded together because a goal is now made of both and a total that mixed
 * currencies would be exactly the bug this project keeps rediscovering.
 */
async function loadAllocations() {
  const [cashRows, holdingAllocRows, holdingRows, rates, base] = await Promise.all([
    db.select().from(bucketAllocations),
    db.select().from(holdingAllocations),
    db.select().from(holdings),
    getRates(),
    getBaseCurrency(),
  ]);

  const accountRows = await db.select().from(accounts);
  const currencyOf = new Map(accountRows.map((a) => [a.id, a.currency]));

  const unconverted: { amount: number; currency: string }[] = [];

  const cash: CashAllocation[] = [];
  for (const a of cashRows) {
    const amount = Number(a.amount);
    const currency = currencyOf.get(a.accountId) ?? base;
    const converted = toBase(amount, currency, rates, base);
    if (converted === null) {
      unconverted.push({ amount, currency });
      continue;
    }
    cash.push({ bucketId: a.bucketId, accountId: a.accountId, amount: converted });
  }

  const holdingById = new Map(holdingRows.map((h) => [h.id, h]));

  const invested: HoldingAllocation[] = [];
  for (const a of holdingAllocRows) {
    const h = holdingById.get(a.holdingId);
    if (!h) continue;

    // A position with no live price falls back to what it cost. Better than
    // treating it as worthless, and the Investments page already flags a
    // stale price where it matters.
    const entry = Number(h.avgEntryPrice);
    const shaped = {
      quantity: Number(h.quantity),
      avgEntryPrice: entry,
      currentPrice: h.currentPrice === null ? entry : Number(h.currentPrice),
      direction: h.direction,
    };

    const value = toBase(marketValue(shaped), h.currency, rates, base);
    const cost = toBase(costBasis(shaped), h.currency, rates, base);
    if (value === null) {
      unconverted.push({ amount: marketValue(shaped), currency: h.currency });
      continue;
    }

    invested.push({
      bucketId: a.bucketId,
      holdingId: a.holdingId,
      percent: Number(a.percent),
      marketValue: value,
      costBasis: cost,
      // Cash and stablecoins hold their value; everything else can fall.
      floating: !(h.assetType !== null && STABLE_ASSET_TYPES.includes(h.assetType)),
    });
  }

  return { cash, invested, base, unconverted, holdingRows };
}

/** Buckets with cash and investments counted together, plus both progress figures. */
export async function listPurposes() {
  const allBuckets = await db.select().from(buckets);
  const { cash, invested, base, unconverted } = await loadAllocations();

  const withTotals = allBuckets.map((b) => ({
    bucket: b,
    totals: purposeTotals(b.id, cash, invested),
  }));

  // Where the money actually is, as a share of everything in buckets.
  const shares = new Map(
    sharesOfTotal(withTotals.map((w) => ({ id: w.bucket.id, total: w.totals.total }))).map((s) => [
      s.id,
      s.percent,
    ])
  );

  return {
    baseCurrency: base,
    unconverted,
    grandTotal:
      Math.round(withTotals.reduce((s, w) => s + w.totals.total, 0) * 100) / 100,
    purposes: withTotals.map(({ bucket: b, totals }) => {
      const target = b.targetAmount === null ? null : Number(b.targetAmount);
      return {
        id: b.id,
        name: b.name,
        icon: b.icon,
        color: b.color,
        totals,
        sharePercent: shares.get(b.id) ?? 0,
        progress: goalProgress(totals, target),
      };
    }),
  };
}

/** How each position is split across goals, for the position's own page. */
export async function getHoldingAllocations(holdingId: string) {
  const [rows, allBuckets] = await Promise.all([
    db.select().from(holdingAllocations).where(eq(holdingAllocations.holdingId, holdingId)),
    db.select().from(buckets),
  ]);

  const bucketName = new Map(allBuckets.map((b) => [b.id, b.name]));
  const shaped: HoldingAllocation[] = rows.map((r) => ({
    bucketId: r.bucketId,
    holdingId: r.holdingId,
    percent: Number(r.percent),
    marketValue: 0,
    costBasis: null,
    floating: true,
  }));

  return {
    allocations: rows.map((r) => ({
      id: r.id,
      bucketId: r.bucketId,
      bucketName: bucketName.get(r.bucketId) ?? "?",
      percent: Number(r.percent),
    })),
    allocated: allocatedPercent(holdingId, shaped),
    unallocated: unallocatedPercent(holdingId, shaped),
    overAllocated: isOverAllocated(holdingId, shaped),
    available: allBuckets
      .filter((b) => !rows.some((r) => r.bucketId === b.id))
      .map((b) => ({ id: b.id, name: b.name })),
  };
}

/**
 * Assigns a share of a position to a goal.
 *
 * A share, not an amount: allocating a fixed €1 500 of an ETF stops being true
 * the moment the price moves. Setting the same pair twice edits it rather than
 * stacking a second row, so a goal can never quietly hold 140% of a position
 * through repeated clicks.
 */
export async function setHoldingAllocation(formData: FormData) {
  const holdingId = String(formData.get("holdingId"));
  const bucketId = String(formData.get("bucketId"));
  const percent = clampPercent(Number(formData.get("percent")));

  if (!holdingId || !bucketId) throw new Error("Pick a position and a goal.");

  if (percent === 0) {
    await db
      .delete(holdingAllocations)
      .where(
        and(eq(holdingAllocations.holdingId, holdingId), eq(holdingAllocations.bucketId, bucketId))
      );
  } else {
    await db
      .insert(holdingAllocations)
      .values({ holdingId, bucketId, percent: String(percent) })
      .onConflictDoUpdate({
        target: [holdingAllocations.holdingId, holdingAllocations.bucketId],
        set: { percent: String(percent), updatedAt: new Date() },
      });
  }

  await db.insert(auditLog).values({
    entityType: "holding_allocation",
    entityId: holdingId,
    action: "holding_allocated",
    details: JSON.stringify({ bucketId, percent }),
  });

  revalidatePath(`/investments/${holdingId}`);
  revalidatePath("/buckets");
  revalidatePath("/");
}

export async function removeHoldingAllocation(formData: FormData) {
  const id = String(formData.get("id"));
  const [row] = await db.select().from(holdingAllocations).where(eq(holdingAllocations.id, id));
  await db.delete(holdingAllocations).where(eq(holdingAllocations.id, id));
  if (row) revalidatePath(`/investments/${row.holdingId}`);
  revalidatePath("/buckets");
}

/** Positions promised to more goals than they can cover. */
export async function overAllocatedHoldings() {
  const { invested, holdingRows } = await loadAllocations();
  const nameOf = new Map(holdingRows.map((h) => [h.id, h.symbol]));

  return [...new Set(invested.map((a) => a.holdingId))]
    .filter((id) => isOverAllocated(id, invested))
    .map((id) => ({
      holdingId: id,
      symbol: nameOf.get(id) ?? "?",
      percent: allocatedPercent(id, invested),
    }));
}
