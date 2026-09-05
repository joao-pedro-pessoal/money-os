"use server";

import { db } from "@/db/client";
import { transactions, transfers, accounts, categories, interestPayments } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { toBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import type { TransactionRow } from "@/lib/money/transactionFilter";

/**
 * The transaction list, converted once so the table can add it up.
 *
 * `currency` was not selected at all before, so every amount rendered with the
 * base currency's symbol whatever it was recorded in — the same mistake the
 * positions table made with its prices. Both are carried now: the converted
 * figure for totals and filters, and the original currency for the row.
 *
 * Converted here rather than in the component, because this is the layer with
 * rates. A row with no rate is left out of the list and counted in
 * `unconverted`, never silently valued at zero.
 */
export async function listTransactions(limit = 100) {
  const [rows, rates, base] = await Promise.all([
    db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        currency: transactions.currency,
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
      .limit(limit),
    getRates(),
    getBaseCurrency(),
  ]);

  const converted: TransactionRow[] = [];
  const unconverted: { amount: number; currency: string }[] = [];

  for (const row of rows) {
    const amount = toBase(Number(row.amount), row.currency, rates, base);
    if (amount === null) {
      unconverted.push({ amount: Number(row.amount), currency: row.currency });
      continue;
    }
    converted.push({
      id: row.id,
      date: new Date(row.date).toISOString(),
      type: row.type,
      amount,
      currency: row.currency,
      accountName: row.accountName,
      categoryName: row.categoryName,
      description: row.description,
      merchant: row.merchant,
    });
  }

  return {
    rows: converted,
    /** Left out for want of a rate, and said rather than counted as nothing. */
    unconverted,
    /** True while any row needed converting, so the table can say "approximate". */
    approximate: rows.some((r) => r.currency !== base),
    baseCurrency: base,
  };
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

  /**
   * The account's currency, not the column's default.
   *
   * `transactions.currency` defaults to EUR and this form has no currency
   * field, so every row was stamped EUR whatever account it landed in — while
   * the balance below was incremented raw. A 100 entered against a USD IBKR
   * account became a 100 EUR row *and* 100 USD of balance: the amount recorded
   * in one currency and added in another, which is the one arithmetic this
   * codebase is not allowed to do.
   *
   * The figure is taken at face value in the account's own currency, because
   * that is the only currency the form could have meant.
   */
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error("Account not found");

  await db.insert(transactions).values({
    accountId,
    type,
    amount: String(signedAmount),
    currency: account.currency,
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

  /**
   * Each leg in its own account's currency.
   *
   * Both rows were stamped with the column's EUR default, so a transfer out of
   * a dollar account was recorded as euros leaving it. The amount typed is in
   * the currency of the account it is typed against, which is the only reading
   * the form supports — and the two legs of a cross-currency transfer are
   * genuinely different amounts, which is exactly why each needs its own label.
   */
  const [from] = await db.select().from(accounts).where(eq(accounts.id, fromAccountId));
  const [to] = await db.select().from(accounts).where(eq(accounts.id, toAccountId));
  if (!from || !to) throw new Error("Account not found");

  const [fromTx] = await db
    .insert(transactions)
    .values({ accountId: fromAccountId, type: "transfer", amount: String(-amount), currency: from.currency, date, description, source: "manual" })
    .returning();

  const [toTx] = await db
    .insert(transactions)
    .values({ accountId: toAccountId, type: "transfer", amount: String(amount), currency: to.currency, date, description, source: "manual" })
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
  // The typed amount wins; the computed one is the fallback when the field was
  // left blank, so the common case is "accept what the rate says".
  const typed = String(formData.get("amount") ?? "").trim();
  const computed = String(formData.get("computedAmount") ?? "").trim();
  const amount = Math.abs(Number(typed !== "" ? typed : computed));
  const date = new Date(String(formData.get("date")));

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Enter an amount, or set a rate on the account so it can be worked out.");
  }

  await db.insert(interestPayments).values({ accountId, amount: String(amount), date });

  const [interestCategory] = await db.select().from(categories).where(eq(categories.name, "Interest"));

  /** In the account's currency, not the column's default. */
  const [earning] = await db.select().from(accounts).where(eq(accounts.id, accountId));

  await db.insert(transactions).values({
    accountId,
    type: "income",
    amount: String(amount),
    currency: earning?.currency ?? "EUR",
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

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "expense");

  if (!name) throw new Error("Category name is required");
  if (kind !== "income" && kind !== "expense") throw new Error("Invalid category kind");

  const fixed = formData.get("fixed") === "on";

  await db.insert(categories).values({ name, kind, fixed }).onConflictDoNothing();

  revalidatePath("/settings");
  revalidatePath("/settings/categories");
  revalidatePath("/transactions");
  revalidatePath("/");
}

/**
 * Marks a category as money that moves whether you act or not.
 *
 * Rent and salary are fixed; groceries and freelance are not. Kept on the
 * category so it's decided once instead of on every transaction — the cost is
 * that a genuinely mixed category lands entirely on one side, and the fix for
 * that is to split it in two.
 */
export async function setCategoryFixed(formData: FormData) {
  const id = String(formData.get("id"));
  const fixed = String(formData.get("fixed")) === "true";

  await db.update(categories).set({ fixed }).where(eq(categories.id, id));

  revalidatePath("/settings/categories");
  revalidatePath("/");
}

export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id"));
  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/settings");
  revalidatePath("/transactions");
}
