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

export async function getBucket(id: string) {
  const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id));
  return bucket;
}

export async function createBucket(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const color = String(formData.get("color") ?? "#6366f1");
  const targetAmount = formData.get("targetAmount") ? String(formData.get("targetAmount")) : null;
  const targetPercent = percentValue(formData.get("targetPercent"));

  if (!name) throw new Error("Bucket name is required");

  const [bucket] = await db
    .insert(buckets)
    .values({ name, description, color, targetAmount, targetPercent })
    .returning();

  await db.insert(auditLog).values({
    entityType: "bucket",
    entityId: bucket.id,
    action: "bucket_created",
    details: JSON.stringify({ name }),
  });

  revalidatePath("/buckets");
  revalidatePath("/money-map");
}

export async function updateBucket(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const color = String(formData.get("color") ?? "#6366f1");
  const targetAmount = formData.get("targetAmount") ? String(formData.get("targetAmount")) : null;
  const targetPercent = percentValue(formData.get("targetPercent"));

  if (!name) throw new Error("Bucket name is required");

  await db
    .update(buckets)
    .set({ name, description, color, targetAmount, targetPercent })
    .where(eq(buckets.id, id));

  await db.insert(auditLog).values({
    entityType: "bucket",
    entityId: id,
    action: "bucket_edited",
    details: JSON.stringify({ name }),
  });

  revalidatePath("/buckets");
  revalidatePath(`/buckets/${id}`);
  revalidatePath("/money-map");
}

/** Deletes the bucket and all its allocations (cascade) — freed money goes back to Free Cash. */
export async function deleteBucket(formData: FormData) {
  const id = String(formData.get("id"));

  await db.insert(auditLog).values({ entityType: "bucket", entityId: id, action: "bucket_deleted" });
  await db.delete(buckets).where(eq(buckets.id, id));

  revalidatePath("/buckets");
  revalidatePath("/money-map");
  revalidatePath("/accounts");
  revalidatePath("/");
}

/**
 * Adds `amount` on top of whatever is already allocated for this account+bucket
 * pair (used by the quick "Add money to a bucket" form on the Buckets list page,
 * where the current allocation isn't shown inline — additive is the intuitive
 * behavior there). setAllocation() above remains the "set exact total" version,
 * used on the account/bucket detail pages where the current amount is visible.
 */
export async function addToAllocation(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const bucketId = String(formData.get("bucketId"));
  const delta = Number(formData.get("amount") ?? "0");

  const [existing] = await db
    .select()
    .from(bucketAllocations)
    .where(and(eq(bucketAllocations.accountId, accountId), eq(bucketAllocations.bucketId, bucketId)));

  const newTotal = Math.round(((existing ? Number(existing.amount) : 0) + delta + Number.EPSILON) * 100) / 100;

  if (newTotal <= 0 && existing) {
    await db.delete(bucketAllocations).where(eq(bucketAllocations.id, existing.id));
  } else if (existing) {
    await db.update(bucketAllocations).set({ amount: String(newTotal), updatedAt: new Date() }).where(eq(bucketAllocations.id, existing.id));
  } else if (newTotal > 0) {
    await db.insert(bucketAllocations).values({ accountId, bucketId, amount: String(newTotal) });
  }

  await db.insert(auditLog).values({
    entityType: "bucket_allocation",
    entityId: bucketId,
    action: "allocation_added",
    details: JSON.stringify({ accountId, bucketId, delta, newTotal }),
  });

  revalidatePath("/buckets");
  revalidatePath(`/buckets/${bucketId}`);
  revalidatePath("/money-map");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
}

/** Upsert an allocation of `amount` from `accountId` into `bucketId`. Amount 0 removes it. */
export async function setAllocation(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const bucketId = String(formData.get("bucketId"));
  const amount = String(formData.get("amount") ?? "0");

  const [existing] = await db
    .select()
    .from(bucketAllocations)
    .where(and(eq(bucketAllocations.accountId, accountId), eq(bucketAllocations.bucketId, bucketId)));

  if (Number(amount) === 0 && existing) {
    await db.delete(bucketAllocations).where(eq(bucketAllocations.id, existing.id));
  } else if (existing) {
    await db
      .update(bucketAllocations)
      .set({ amount, updatedAt: new Date() })
      .where(eq(bucketAllocations.id, existing.id));
  } else if (Number(amount) !== 0) {
    await db.insert(bucketAllocations).values({ accountId, bucketId, amount });
  }

  await db.insert(auditLog).values({
    entityType: "bucket_allocation",
    entityId: bucketId,
    action: "allocation_set",
    details: JSON.stringify({ accountId, bucketId, amount }),
  });

  revalidatePath("/buckets");
  revalidatePath(`/buckets/${bucketId}`);
  revalidatePath("/money-map");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
}


/** Percentages are 0-100; anything outside that is rejected, blank means no plan. */
function percentValue(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? "").trim();
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error("Target percentage must be between 0 and 100");
  }
  return String(n);
}
