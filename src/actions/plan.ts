"use server";

import { db } from "@/db/client";
import { buckets, bucketAllocations, accounts, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { buildPlan, type PlannedBucket } from "@/lib/accounting/plan";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { sumInBase } from "@/lib/fx";

/**
 * The percentage plan against the money currently available.
 *
 * "Available" is the total of all active account balances, converted to the
 * base currency — the pot the percentages describe.
 */
export async function getBucketPlan() {
  const [allBuckets, allocations, allAccounts, rates, base] = await Promise.all([
    db.select().from(buckets),
    db.select().from(bucketAllocations),
    db.select().from(accounts).where(eq(accounts.active, true)),
    getRates(),
    getBaseCurrency(),
  ]);

  const { total: available, unconverted } = sumInBase(
    allAccounts.map((a) => ({ amount: Number(a.balance), currency: a.currency })),
    rates,
    base
  );

  const planned: PlannedBucket[] = allBuckets.map((b) => ({
    id: b.id,
    name: b.name,
    targetPercent: b.targetPercent === null ? null : Number(b.targetPercent),
    current: allocations
      .filter((a) => a.bucketId === b.id)
      .reduce((s, a) => s + Number(a.amount), 0),
    targetAmount: b.targetAmount === null ? null : Number(b.targetAmount),
  }));

  return { ...buildPlan(planned, available), available, baseCurrency: base, unconverted };
}

/**
 * Brings allocations in line with the percentage plan.
 *
 * Deliberately explicit — nothing here runs on its own. It only rewrites
 * BucketAllocation rows (the app's own bookkeeping of what money is earmarked
 * for); no real money moves anywhere, because the app cannot move money.
 *
 * Allocations are spread across accounts in order, filling each one's balance
 * before moving to the next, so no account ends up overallocated.
 */
export async function applyBucketPlan() {
  const plan = await getBucketPlan();
  const activeAccounts = await db.select().from(accounts).where(eq(accounts.active, true));

  if (plan.overcommitted) {
    throw new Error(
      `Your percentages add up to ${plan.totalPercent}%. Bring them to 100% or less before applying.`
    );
  }

  // Start from scratch so removed percentages don't leave stale allocations.
  await db.delete(bucketAllocations);

  // Capacity per account, consumed as buckets are filled.
  const capacity = activeAccounts.map((a) => ({ id: a.id, left: Number(a.balance) }));

  for (const row of plan.rows) {
    if (row.targetPercent === null) continue;
    let remaining = row.target;

    for (const acc of capacity) {
      if (remaining <= 0) break;
      if (acc.left <= 0) continue;

      const take = Math.min(acc.left, remaining);
      const amount = Math.round((take + Number.EPSILON) * 100) / 100;
      if (amount <= 0) continue;

      await db.insert(bucketAllocations).values({
        accountId: acc.id,
        bucketId: row.id,
        amount: String(amount),
      });

      acc.left = Math.round((acc.left - amount + Number.EPSILON) * 100) / 100;
      remaining = Math.round((remaining - amount + Number.EPSILON) * 100) / 100;
    }
  }

  await db.insert(auditLog).values({
    entityType: "bucket_plan",
    entityId: "plan",
    action: "plan_applied",
    details: JSON.stringify({
      available: plan.available,
      totalPercent: plan.totalPercent,
      buckets: plan.rows.filter((r) => r.targetPercent !== null).map((r) => ({ name: r.name, target: r.target })),
    }),
  });

  revalidatePath("/buckets");
  revalidatePath("/money-map");
  revalidatePath("/");
}
