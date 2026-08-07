"use server";

import { db } from "@/db/client";
import { transactions, transfers, accounts, categories, subcategories, interestPayments } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function listTransactions(limit = 100) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      type: transactions.type,
      description: transactions.description,
      merchant: transactions.merchant,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(desc(transactions.date))
    .limit(limit);
}

/** Income or expense transaction. Also adjusts the account balance. */
export async function createTransaction(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const type = String(formData.get("type")) as "income" | "expense" | "investment_contribution";
  const amount = Number(formData.get("amount"));
  const date = new Date(String(formData.get("date")));
  const categoryId = formData.get("categoryId") ? String(formData.get("categoryId")) : null;
  const description = String(formData.get("description") ?? "");
  const merchant = String(formData.get("merchant") ?? "");

  const signedAmount = type === "expense" || type === "investment_contribution" ? -Math.abs(amount) : Math.abs(amount);

  await db.insert(transactions).values({
    accountId,
    type,
    amount: String(signedAmount),
    date,
    categoryId,
    description,
    merchant,
    source: "manual",
  });

  await db
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${signedAmount}`, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

/**
 * Internal transfer between two of the user's own accounts.
 * Never counts as income/expense, never changes Net Worth
 * (PRODUCT_VISION.md §9 / MVP_SPEC.md §4).
 */
export async function createTransfer(formData: FormData) {
  const fromAccountId = String(formData.get("fromAccountId"));
  const toAccountId = String(formData.get("toAccountId"));
  const amount = Math.abs(Number(formData.get("amount")));
  const date = new Date(String(formData.get("date")));
  const description = String(formData.get("description") ?? "Internal transfer");

  if (fromAccountId === toAccountId) throw new Error("Cannot transfer to the same account");

  const [fromTx] = await db
    .insert(transactions)
    .values({ accountId: fromAccountId, type: "transfer", amount: String(-amount), date, description, source: "manual" })
    .returning();

  const [toTx] = await db
    .insert(transactions)
    .values({ accountId: toAccountId, type: "transfer", amount: String(amount), date, description, source: "manual" })
    .returning();

  await db.insert(transfers).values({ fromTransactionId: fromTx.id, toTransactionId: toTx.id });

  await db.update(accounts).set({ balance: sql`${accounts.balance} - ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, fromAccountId));
  await db.update(accounts).set({ balance: sql`${accounts.balance} + ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, toAccountId));

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Interest counts as income, and updates the account balance (MVP_SPEC.md §3/§6). */
export async function createInterestPayment(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const amount = Math.abs(Number(formData.get("amount")));
  const date = new Date(String(formData.get("date")));

  await db.insert(interestPayments).values({ accountId, amount: String(amount), date });

  const [interestCategory] = await db.select().from(categories).where(eq(categories.name, "Interest"));

  await db.insert(transactions).values({
    accountId,
    type: "income",
    amount: String(amount),
    date,
    categoryId: interestCategory?.id ?? null,
    description: "Interest",
    source: "manual",
  });

  await db.update(accounts).set({ balance: sql`${accounts.balance} + ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, accountId));

  revalidatePath("/interest");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function getTransaction(id: string) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
  return tx;
}

export async function isTransferLeg(transactionId: string) {
  const [leg] = await db
    .select()
    .from(transfers)
    .where(sql`${transfers.fromTransactionId} = ${transactionId} OR ${transfers.toTransactionId} = ${transactionId}`);
  return leg ?? null;
}

/** Edit an income/expense/investment_contribution transaction. Transfers can't be edited here — delete + recreate. */
export async function updateTransaction(formData: FormData) {
  const id = String(formData.get("id"));
  const amount = Number(formData.get("amount"));
  const date = new Date(String(formData.get("date")));
  const categoryId = formData.get("categoryId") ? String(formData.get("categoryId")) : null;
  const description = String(formData.get("description") ?? "");

  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!tx) throw new Error("Transaction not found");
  if (tx.type === "transfer") throw new Error("Transfers can't be edited — delete and recreate instead");

  const oldAmount = Number(tx.amount);
  const signedAmount = tx.type === "expense" || tx.type === "investment_contribution" ? -Math.abs(amount) : Math.abs(amount);
  const delta = signedAmount - oldAmount;

  await db
    .update(transactions)
    .set({ amount: String(signedAmount), date, categoryId, description })
    .where(eq(transactions.id, id));

  if (delta !== 0) {
    await db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${delta}`, updatedAt: new Date() })
      .where(eq(accounts.id, tx.accountId));
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${tx.accountId}`);
  revalidatePath("/");
}

/**
 * Delete a transaction and reverse its effect on the account balance.
 * If it's one leg of an internal transfer, deletes both legs and reverses
 * both accounts, so a transfer can never be left half-deleted.
 */
export async function deleteTransaction(formData: FormData) {
  const id = String(formData.get("id"));
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!tx) return;

  const [transferLink] = await db
    .select()
    .from(transfers)
    .where(sql`${transfers.fromTransactionId} = ${id} OR ${transfers.toTransactionId} = ${id}`);

  if (transferLink) {
    const [fromTx] = await db.select().from(transactions).where(eq(transactions.id, transferLink.fromTransactionId));
    const [toTx] = await db.select().from(transactions).where(eq(transactions.id, transferLink.toTransactionId));

    if (fromTx) {
      await db
        .update(accounts)
        .set({ balance: sql`${accounts.balance} - ${Number(fromTx.amount)}`, updatedAt: new Date() })
        .where(eq(accounts.id, fromTx.accountId));
    }
    if (toTx) {
      await db
        .update(accounts)
        .set({ balance: sql`${accounts.balance} - ${Number(toTx.amount)}`, updatedAt: new Date() })
        .where(eq(accounts.id, toTx.accountId));
    }

    await db.delete(transfers).where(eq(transfers.id, transferLink.id));
    await db.delete(transactions).where(eq(transactions.id, transferLink.fromTransactionId));
    await db.delete(transactions).where(eq(transactions.id, transferLink.toTransactionId));
  } else {
    await db
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${Number(tx.amount)}`, updatedAt: new Date() })
      .where(eq(accounts.id, tx.accountId));
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function listCategories() {
  return db.select().from(categories);
}
