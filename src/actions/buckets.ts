"use server";

import { db } from "@/db/client";
import { buckets, bucketAllocations, accounts, auditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { bucketTotal } from "@/lib/accounting";

export async function listBucketsWithTotals() {
  const allBuckets = await db.select().from(buckets);
  const allAllocations = await db.select().from(bucketAllocations);
  const allAccounts = await db.select().from(accounts);

  return allBuckets.map((b) => {
    const allocs = allAllocations
      .filter((a) => a.bucketId === b.id)
      .map((a) => ({
        ...a,
        amount: Number(a.amount),
        accountName: allAccounts.find((acc) => acc.id === a.accountId)?.name ?? "?",
      }));
    return {
      ...b,
      total: bucketTotal(
        b.id,
        allAllocations.map((a) => ({
          accountId: a.accountId,
          bucketId: a.bucketId,
          amount: Number(a.amount),
        }))
      ),
      allocations: allocs,
    };
  });
}

export async function createBucket(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const color = String(formData.get("color") ?? "#6366f1");
  const targetAmount = formData.get("targetAmount") ? String(formData.get("targetAmount")) : null;

  if (!name) throw new Error("Bucket name is required");

  const [bucket] = await db.insert(buckets).values({ name, description, color, targetAmount }).returning();

  await db.insert(auditLog).values({
    entityType: "bucket",
    entityId: bucket.id,
    action: "bucket_created",
    details: JSON.stringify({ name }),
  });

  revalidatePath("/buckets");
  revalidatePath("/money-map");
}

/** Upsert an allocation of `amount` from `accountId` into `bucketId`. */
export async function setAllocation(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const bucketId = String(formData.get("bucketId"));
  const amount = String(formData.get("amount") ?? "0");

  const [existing] = await db
    .select()
    .from(bucketAllocations)
    .where(and(eq(bucketAllocations.accountId, accountId), eq(bucketAllocations.bucketId, bucketId)));

  if (existing) {
    await db
      .update(bucketAllocations)
      .set({ amount, updatedAt: new Date() })
      .where(eq(bucketAllocations.id, existing.id));
  } else {
    await db.insert(bucketAllocations).values({ accountId, bucketId, amount });
  }

  await db.insert(auditLog).values({
    entityType: "bucket_allocation",
    entityId: bucketId,
    action: "allocation_set",
    details: JSON.stringify({ accountId, bucketId, amount }),
  });

  revalidatePath("/buckets");
  revalidatePath("/money-map");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
}
