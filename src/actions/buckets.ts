"use server";

import { db } from "@/db/client";
import { buckets, bucketAllocations, accounts, auditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ManualEntryError, manualBalance } from "@/lib/money/manualEntry";
import { sumInBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";

import { claimManualRequest, manualEntryResult, manualRequestId } from "./manualRequest";

export async function listBucketsWithTotals() {
  const [allBuckets, allAllocations, allAccounts, rates, baseCurrency] = await Promise.all([
    db.select().from(buckets), db.select().from(bucketAllocations), db.select().from(accounts), getRates(), getBaseCurrency(),
  ]);
  const accountById = new Map(allAccounts.map(a => [a.id, a]));
  return allBuckets.map(b => {
    const allocations = allAllocations.filter(a => a.bucketId === b.id).map(a => ({
      ...a, amount: Number(a.amount), accountName: accountById.get(a.accountId)?.name ?? "?",
      currency: accountById.get(a.accountId)?.currency ?? "Unknown",
    }));
    const converted = sumInBase(allocations.map(a => ({ amount: a.amount, currency: a.currency })), rates, baseCurrency);
    return { ...b, total: converted.total, baseCurrency, unconverted: converted.unconverted, allocations };
  });
}

export async function getBucket(id: string) {
  const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id));
  return bucket;
}

function bucketDetails(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new ManualEntryError("Bucket name is required");
  const rawTarget = String(formData.get("targetAmount") ?? "").trim();
  const targetAmount = rawTarget ? manualBalance(rawTarget,"Enter a goal target with at most two decimal places.") : null;
  if (targetAmount !== null && Number(targetAmount) < 0) throw new ManualEntryError("A goal target cannot be negative.");
  return { name, description: String(formData.get("description") ?? ""), color: String(formData.get("color") ?? "#6366f1"), targetAmount };
}

export async function createBucket(formData: FormData) {
  const id = await manualRequestId(formData);
  const values = bucketDetails(formData);
  await db.transaction(async store => {
    if (!(await claimManualRequest(store,id,"bucket:create",id,JSON.stringify(values)))) {
      const [existing] = await store.select({id:buckets.id}).from(buckets).where(eq(buckets.id,id));
      if (!existing) throw new ManualEntryError("This entry has already been deleted.");
      return;
    }
    await store.insert(buckets).values({id,...values});
    await store.insert(auditLog).values({entityType:"bucket",entityId:id,action:"bucket_created",details:JSON.stringify({name:values.name})});
  });
  revalidatePath("/buckets");
  revalidatePath("/money-map");
}

export async function submitBucketCreation(formData: FormData) {
  return manualEntryResult(() => createBucket(formData));
}

export async function updateBucket(formData: FormData) {
  const id = String(formData.get("id"));
  const values = bucketDetails(formData);
  const rawPriority = Number(formData.get("priority"));
  const priority = Number.isFinite(rawPriority) ? String(Math.max(0, Math.round(rawPriority))) : undefined;
  await db.transaction(async store => {
    const [updated] = await store.update(buckets).set({...values,...(priority !== undefined ? {priority} : {})}).where(eq(buckets.id,id)).returning({id:buckets.id});
    if (!updated) throw new ManualEntryError("Bucket not found");
    await store.insert(auditLog).values({entityType:"bucket",entityId:id,action:"bucket_edited",details:JSON.stringify({name:values.name})});
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
  const requestId = await manualRequestId(formData);
  await saveAllocation(formData, true, requestId);
}

export async function submitAllocationAddition(formData: FormData) {
  return manualEntryResult(() => addToAllocation(formData));
}

/** Sets an exact total; zero releases the allocation without moving money. */
export async function setAllocation(formData: FormData) {
  await saveAllocation(formData, false);
}

async function saveAllocation(formData: FormData, additive: boolean, requestId?: string) {
  const accountId = String(formData.get("accountId"));
  const bucketId = String(formData.get("bucketId"));
  const amount = Number(manualBalance(String(formData.get("amount") ?? ""),"Enter an allocation amount with at most two decimal places."));
  if (!additive && amount < 0) throw new ManualEntryError("An allocation cannot be negative.");
  await db.transaction(async store => {
    // There may not be a pair to lock yet. Lock its account before reading it.
    const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
    const [bucket] = await store.select().from(buckets).where(eq(buckets.id, bucketId)).for("update");
    if (!account?.active || !bucket) throw new ManualEntryError("Choose an active account and an existing bucket.");
    if (requestId && !(await claimManualRequest(store,requestId,"allocation:add",bucketId,JSON.stringify({accountId,bucketId,amount})))) return;
    const pair = and(eq(bucketAllocations.accountId, accountId), eq(bucketAllocations.bucketId, bucketId));
    const existing = await store.select().from(bucketAllocations).where(pair);
    const total = Math.round((amount + (additive ? existing.reduce((sum, row) => sum + Number(row.amount), 0) : 0)) * 100) / 100;
    if (total < 0) throw new ManualEntryError("An allocation cannot be negative.");
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
