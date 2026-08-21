"use server";

import { db } from "@/db/client";
import {
  accounts,
  accountConnections,
  accountSnapshots,
  auditLog,
  bucketAllocations,
  categories,
  holdings,
  imports,
  transactions,
  interestPayments,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { reconciliationState, overallocatedAmount, freeCash, allocatedCash } from "@/lib/accounting";
import { isAbandoned, reasonsToKeep, type AccountUsage } from "@/lib/accounting/abandoned";
import { meaningOf } from "@/lib/accounting/balanceScope";
import { writeSnapshot } from "./snapshots";

export async function listAccountsWithState() {
  const allAccounts = await db.select().from(accounts).where(eq(accounts.active, true));
  const allAllocations = await db.select().from(bucketAllocations);

  return allAccounts.map((acc) => {
    const balance = Number(acc.balance);
    const allocations = allAllocations
      .filter((a) => a.accountId === acc.id)
      .map((a) => ({ accountId: a.accountId, amount: Number(a.amount) }));

    /**
     * Only for an account that declares itself part-invested.
     *
     * Read through the meaning rather than off the column, so a figure left
     * behind by a since-changed setting can't quietly reduce the cash of an
     * account that is now all cash.
     */
    const shape = {
      id: acc.id,
      balance,
      investedValue:
        meaningOf(acc.balanceMeaning) === "bank_and_broker"
          ? Number(acc.investedValue ?? 0)
          : null,
    };

    return {
      ...acc,
      balance,
      free: freeCash(shape, allocations),
      allocated: allocatedCash(acc.id, allocations),
      state: reconciliationState(shape, allocations, acc.lastManualUpdate ?? acc.createdAt, new Date()),
      overallocatedBy: overallocatedAmount(shape, allocations),
    };
  });
}

export async function listArchivedAccounts() {
  return db.select().from(accounts).where(eq(accounts.active, false));
}

/**
 * The invested half of a `bank_and_broker` balance, from the form.
 *
 * Null unless that meaning was chosen: carrying a stale figure on an account
 * that is no longer split would silently move money out of cash on a screen
 * that no longer shows the field.
 */
function investedValueFrom(formData: FormData, meaning: string): string | null {
  if (meaning !== "bank_and_broker") return null;
  const raw = String(formData.get("investedValue") ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

export async function createAccount(formData: FormData) {
  const institution = String(formData.get("institution") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const accountType = String(formData.get("accountType") ?? "other");
  const currency = String(formData.get("currency") ?? "EUR");
  const balance = String(formData.get("balance") ?? "0");
  const balanceMeaning = meaningOf(String(formData.get("balanceMeaning") ?? ""));

  if (!institution || !name) throw new Error("Institution and name are required");

  const [acc] = await db
    .insert(accounts)
    .values({
      institution,
      name,
      accountType,
      currency,
      balance,
      balanceMeaning,
      investedValue: investedValueFrom(formData, balanceMeaning),
      lastManualUpdate: new Date(),
    })
    .returning();

  await writeSnapshot(acc.id, Number(balance), currency);
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
  const balanceMeaning = meaningOf(String(formData.get("balanceMeaning") ?? ""));

  if (!institution || !name) throw new Error("Institution and name are required");

  await db
    .update(accounts)
    .set({
      institution,
      name,
      accountType,
      currency,
      notes,
      /**
       * Only when the form actually asked.
       *
       * `meaningOf` falls back to "cash_only" for anything it doesn't
       * recognise, including an absent field — so a form without this input was
       * resetting the meaning on every save. Renaming an account quietly turned
       * "the broker's total" into "idle cash", and every position it held
       * started being added on top of a balance that already contained them.
       * The double count, arriving through the edit screen.
       */
      ...(formData.has("balanceMeaning")
        ? {
            balanceMeaning,
            // Cleared when the meaning moves away from "both", or the account
            // keeps an invested half through a field the form stopped showing.
            investedValue: investedValueFrom(formData, balanceMeaning),
          }
        : {}),
      /**
       * Absent means "not edited here" rather than "cleared" — the field only
       * appears on some forms, and a form that doesn't show it must not wipe it.
       */
      ...(formData.has("portfolioCashPercent")
        ? {
            portfolioCashPercent: (() => {
              const raw = String(formData.get("portfolioCashPercent") ?? "").trim();
              if (raw === "") return null;
              const n = Number(raw);
              if (!Number.isFinite(n)) return null;
              return String(Math.min(100, Math.max(0, n)));
            })(),
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id));

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: id,
    action: "account_edited",
    details: JSON.stringify({ institution, name, accountType, currency, balanceMeaning }),
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

/**
 * How much every account is actually being used.
 *
 * One pass over each referencing table rather than N queries per account —
 * these tables are small enough that counting in memory is simpler and faster
 * than a pile of correlated subqueries.
 */
export async function listAccountUsage(): Promise<
  (AccountUsage & { createdAt: Date; active: boolean; keptBecause: string[] })[]
> {
  const [all, tx, hold, alloc, conns, imps, snaps] = await Promise.all([
    db.select().from(accounts),
    db.select().from(transactions),
    db.select().from(holdings),
    db.select().from(bucketAllocations),
    db.select().from(accountConnections),
    db.select().from(imports),
    db.select().from(accountSnapshots),
  ]);

  const count = <T,>(rows: T[], pick: (r: T) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };

  const txByAccount = count(tx, (t) => t.accountId);
  const holdByAccount = count(hold, (h) => h.accountId);
  const allocByAccount = count(alloc, (a) => a.accountId);
  const connByAccount = count(conns, (c) => c.accountId);
  const impByAccount = count(imps, (i) => i.accountId);
  const snapByAccount = count(snaps, (s) => s.accountId);

  return all.map((a) => {
    const usage: AccountUsage = {
      id: a.id,
      name: a.name,
      institution: a.institution,
      balance: Number(a.balance),
      transactions: txByAccount.get(a.id) ?? 0,
      holdings: holdByAccount.get(a.id) ?? 0,
      allocations: allocByAccount.get(a.id) ?? 0,
      connections: connByAccount.get(a.id) ?? 0,
      imports: impByAccount.get(a.id) ?? 0,
      snapshots: snapByAccount.get(a.id) ?? 0,
    };
    return {
      ...usage,
      createdAt: a.createdAt,
      active: a.active,
      keptBecause: reasonsToKeep(usage),
    };
  });
}

/** The accounts the tidy-up would remove. Shown before anything is deleted. */
export async function listRemovableAccounts() {
  const usage = await listAccountUsage();
  return usage.filter(isAbandoned);
}

/**
 * Deletes accounts that nothing references.
 *
 * Re-checks emptiness at delete time rather than trusting the ids the form
 * sent: the list may have been rendered minutes ago, and an account that has
 * gained a transaction since then must not be swept away by a stale click.
 */
export async function removeEmptyAccounts(formData: FormData) {
  const requested = new Set(formData.getAll("accountId").map(String));
  const usage = await listAccountUsage();

  const safe = usage.filter((u) => requested.has(u.id) && isAbandoned(u));
  for (const a of safe) {
    await db.delete(accounts).where(eq(accounts.id, a.id));
  }

  await db.insert(auditLog).values({
    entityType: "account",
    entityId: "bulk",
    action: "empty_accounts_removed",
    details: JSON.stringify({
      removed: safe.map((a) => `${a.institution} / ${a.name}`),
      skipped: requested.size - safe.length,
    }),
  });

  revalidatePath("/accounts");
  revalidatePath("/connections");
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

  await writeSnapshot(accountId, newBalance, acc.currency);

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
