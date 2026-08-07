"use server";

import { db } from "@/db/client";
import { accounts, accountSnapshots, auditLog, bucketAllocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { reconciliationState, overallocatedAmount, freeCash, allocatedCash } from "@/lib/accounting";

export async function listAccountsWithState() {
  const allAccounts = await db.select().from(accounts).where(eq(accounts.active, true));
  const allAllocations = await db.select().from(bucketAllocations);

  return allAccounts.map((acc) => {
    const balance = Number(acc.balance);
    const allocations = allAllocations
      .filter((a) => a.accountId === acc.id)
      .map((a) => ({ accountId: a.accountId, amount: Number(a.amount) }));
    return {
      ...acc,
      balance,
      free: freeCash({ id: acc.id, balance }, allocations),
      allocated: allocatedCash(acc.id, allocations),
      state: reconciliationState(
        { id: acc.id, balance },
        allocations,
        acc.lastManualUpdate ?? acc.createdAt,
        new Date()
      ),
      overallocatedBy: overallocatedAmount({ id: acc.id, balance }, allocations),
    };
  });
}

export async function createAccount(formData: FormData) {
  const institution = String(formData.get("institution") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("accountType") ?? "other");
  const currency = String(formData.get("currency") ?? "EUR");
  const balance = String(formData.get("balance") ?? "0");

  if (!institution || !name) throw new Error("Institution and name are required");

  const [acc] = await db
    .insert(accounts)
    .values({ institution, name, accountType, currency, balance, lastManualUpdate: new Date() })
    .returning();

  await db.insert(accountSnapshots).values({ accountId: acc.id, balance });
  await db.insert(auditLog).values({
    entityType: "account",
    entityId: acc.id,
    action: "account_created",
    details: JSON.stringify({ institution, name, balance }),
  });

  revalidatePath("/accounts");
  revalidatePath("/");
}

/**
 * Reconciliation-assisted balance update (MVP_SPEC.md §58 style, scoped to V1):
 * the user records the new real balance and classifies the difference.
 */
export async function updateAccountBalance(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const newBalance = Number(formData.get("newBalance"));
  const classification = String(formData.get("classification") ?? "correction");

  const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!acc) throw new Error("Account not found");

  const oldBalance = Number(acc.balance);
  const diff = Math.round((newBalance - oldBalance + Number.EPSILON) * 100) / 100;

  await db
    .update(accounts)
    .set({ balance: String(newBalance), lastManualUpdate: new Date(), updatedAt: new Date() })
    .where(eq(accounts.id, accountId));

  await db.insert(accountSnapshots).values({ accountId, balance: String(newBalance) });

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: accountId,
    action: "balance_updated",
    details: JSON.stringify({ oldBalance, newBalance, diff, classification }),
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

export async function getAccount(id: string) {
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, id));
  return acc;
}

export async function getAccountSnapshots(accountId: string) {
  return db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.accountId, accountId))
    .orderBy(accountSnapshots.timestamp);
}
