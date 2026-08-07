"use server";

import { db } from "@/db/client";
import {
  accounts,
  accountSnapshots,
  auditLog,
  bucketAllocations,
  categories,
  transactions,
  interestPayments,
} from "@/db/schema";
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

export async function listArchivedAccounts() {
  return db.select().from(accounts).where(eq(accounts.active, false));
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

/** Edit the descriptive fields of an account. Does NOT touch balance (use updateAccountBalance for that). */
export async function updateAccount(formData: FormData) {
  const id = String(formData.get("id"));
  const institution = String(formData.get("institution") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("accountType") ?? "other");
  const currency = String(formData.get("currency") ?? "EUR");
  const notes = String(formData.get("notes") ?? "");

  if (!institution || !name) throw new Error("Institution and name are required");

  await db
    .update(accounts)
    .set({ institution, name, accountType, currency, notes, updatedAt: new Date() })
    .where(eq(accounts.id, id));

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: id,
    action: "account_edited",
    details: JSON.stringify({ institution, name, accountType, currency }),
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  revalidatePath("/");
}

/** Archive (soft delete). Preserves history — transactions/snapshots keep referencing it. */
export async function archiveAccount(formData: FormData) {
  const id = String(formData.get("id"));
  await db.update(accounts).set({ active: false, updatedAt: new Date() }).where(eq(accounts.id, id));
  await db.insert(auditLog).values({ entityType: "account", entityId: id, action: "account_archived" });
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function unarchiveAccount(formData: FormData) {
  const id = String(formData.get("id"));
  await db.update(accounts).set({ active: true, updatedAt: new Date() }).where(eq(accounts.id, id));
  await db.insert(auditLog).values({ entityType: "account", entityId: id, action: "account_unarchived" });
  revalidatePath("/accounts");
  revalidatePath("/");
}

async function categoryByName(name: string) {
  const [cat] = await db.select().from(categories).where(eq(categories.name, name));
  return cat ?? null;
}

/**
 * Reconciliation-assisted balance update (MVP_SPEC.md §58 style, scoped to V1).
 *
 * The user records the new real balance and classifies the difference. Unlike
 * the first pass of this action, the classification now actually has
 * accounting consequences instead of only being logged:
 * - interest  -> InterestPayment + income Transaction (category "Interest")
 * - income    -> income Transaction (category "Other Income")
 * - expense   -> expense Transaction (category "Other")
 * - deposit   -> income Transaction, tagged as an external deposit
 * - withdrawal-> expense Transaction, tagged as an external withdrawal
 * - correction/other -> balance is fixed, no cash-flow transaction is created
 *   (this is the "I mis-recorded this, not real money movement" case).
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

  if (diff !== 0) {
    const date = new Date();
    if (classification === "interest") {
      await db.insert(interestPayments).values({ accountId, amount: String(Math.abs(diff)), date });
      const cat = await categoryByName("Interest");
      await db.insert(transactions).values({
        accountId,
        type: "income",
        amount: String(diff),
        date,
        categoryId: cat?.id ?? null,
        description: "Interest (reconciliation)",
        source: "manual",
      });
    } else if (classification === "income" || classification === "deposit") {
      const cat = await categoryByName("Other Income");
      await db.insert(transactions).values({
        accountId,
        type: "income",
        amount: String(Math.abs(diff)),
        date,
        categoryId: cat?.id ?? null,
        description: classification === "deposit" ? "Deposit (reconciliation)" : "Income (reconciliation)",
        source: "manual",
      });
    } else if (classification === "expense" || classification === "withdrawal") {
      const cat = await categoryByName("Other");
      await db.insert(transactions).values({
        accountId,
        type: "expense",
        amount: String(-Math.abs(diff)),
        date,
        categoryId: cat?.id ?? null,
        description: classification === "withdrawal" ? "Withdrawal (reconciliation)" : "Expense (reconciliation)",
        source: "manual",
      });
    }
    // classification === "correction" / "other": balance fixed, no transaction —
    // this is a recording fix, not a real movement of money.
  }

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: accountId,
    action: "balance_updated",
    details: JSON.stringify({ oldBalance, newBalance, diff, classification }),
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/transactions");
  revalidatePath("/interest");
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
