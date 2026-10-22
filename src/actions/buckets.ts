"use server";

import { db } from "@/db/client";
import { buckets, bucketAllocations, accounts, auditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { manualBalance } from "@/lib/money/manualEntry";
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

  if (!name) throw new Error("Bucket name is required");

  const [bucket] = await db
    .insert(buckets)
    .values({ name, description, color, targetAmount })
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
  const rawPriority = Number(formData.get("priority"));
  const priority = Number.isFinite(rawPriority) ? String(Math.max(0, Math.round(rawPriority))) : undefined;

  if (!name) throw new Error("Bucket name is required");

  await db
    .update(buckets)
    .set({ name, description, color, targetAmount, ...(priority !== undefined ? { priority } : {}) })
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
  await saveAllocation(formData, true);
}

/** Sets an exact total; zero releases the allocation without moving money. */
export async function setAllocation(formData: FormData) {
  await saveAllocation(formData, false);
}

async function saveAllocation(formData: FormData, additive: boolean) {
  const accountId = String(formData.get("accountId"));
  const bucketId = String(formData.get("bucketId"));
  const amount = Number(manualBalance(String(formData.get("amount") ?? "")));
  if (!additive && amount < 0) throw new Error("An allocation cannot be negative.");
  await db.transaction(async store => {
    // There may not be a pair to lock yet. Lock its account before reading it.
    const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
    const [bucket] = await store.select().from(buckets).where(eq(buckets.id, bucketId)).for("update");
    if (!account?.active || !bucket) throw new Error("Choose an active account and an existing bucket.");
    const pair = and(eq(bucketAllocations.accountId, accountId), eq(bucketAllocations.bucketId, bucketId));
    const existing = await store.select().from(bucketAllocations).where(pair);
    const total = Math.round((amount + (additive ? existing.reduce((sum, row) => sum + Number(row.amount), 0) : 0)) * 100) / 100;
    if (total < 0) throw new Error("An allocation cannot be negative.");
    // Replacing the pair also preserves the summed value of legacy duplicates.
    await store.delete(bucketAllocations).where(pair);
    if (total > 0) await store.insert(bucketAllocations).values({ accountId, bucketId, amount: total.toFixed(2) });
    await store.insert(auditLog).values({
      entityType: "bucket_allocation", entityId: bucketId,
      action: additive ? "allocation_added" : "allocation_set",
      details: JSON.stringify({ accountId, bucketId, amount, newTotal: total }),
    });
  });
  revalidatePath("/buckets");
  revalidatePath(`/buckets/${bucketId}`);
  revalidatePath("/money-map");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}
