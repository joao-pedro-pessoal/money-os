"use server";

import { db } from "@/db/client";
import { transactions, transfers, accounts, categories, interestPayments, auditLog } from "@/db/schema";
import { eq, desc, sql, inArray, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { toBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import type { TransactionRow } from "@/lib/money/transactionFilter";
import { hasSession } from "./session";
import { manualAmount, manualDate, isQuickEntryId } from "@/lib/money/manualEntry";
import { getDefaultAccountId } from "./settings";
import { assertCashbackLink, purchaseSavings } from "@/lib/money/savings";

async function requireSession() {
  if (!(await hasSession())) {
    throw new Error("Your session has expired. Sign in again.");
  }
}

export async function getQuickEntryOptions() {
  await requireSession();
  const [accountRows, categoryRows, defaultAccountId] = await Promise.all([
    db.select({ id: accounts.id, name: accounts.name, currency: accounts.currency }).from(accounts).where(eq(accounts.active, true)),
    db.select({ id: categories.id, name: categories.name, kind: categories.kind }).from(categories),
    getDefaultAccountId(),
  ]);
  return { accounts: accountRows, categories: categoryRows, defaultAccountId };
}

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
  await requireSession();
  await saveManualTransaction(formData);
}

async function saveManualTransaction(formData: FormData, requestId?: string) {
  const accountId = String(formData.get("accountId"));
  const type = String(formData.get("type")) as "income" | "expense" | "investment_contribution";
  if (!["income", "expense", "investment_contribution"].includes(type)) throw new Error("Invalid transaction type.");
  const amount = Number(manualAmount(String(formData.get("amount") ?? "")));
  const date = manualDate(String(formData.get("date") ?? ""));
  const categoryId = formData.get("categoryId") ? String(formData.get("categoryId")) : null;
  const description = String(formData.get("description") ?? "");
  const merchant = String(formData.get("merchant") ?? "");
  const savings = purchaseSavings(type, String(amount), {
    discount: String(formData.get("discountAmount") ?? ""),
    originalPrice: String(formData.get("originalPrice") ?? ""),
    expected: String(formData.get("cashbackExpected") ?? ""),
  });
  const cashbackForId = String(formData.get("cashbackForId") ?? "") || null;

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
  const saved = await db.transaction(async (store) => {
  const [purchase] = cashbackForId ? await store.select().from(transactions).where(eq(transactions.id, cashbackForId)).for("update") : [];
  if (cashbackForId && !purchase) throw new Error("Purchase not found.");
  const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
  if (!account?.active) throw new Error("Choose an active account.");
  if (purchase) assertCashbackLink({ id: requestId ?? '', type, amount: String(signedAmount), currency: account.currency, date: date.toISOString(), accountId, ...savings }, { ...purchase, date: purchase.date.toISOString() });
  if (categoryId) {
    const [category] = await store.select().from(categories).where(eq(categories.id, categoryId));
    if (!category || (type !== "investment_contribution" && category.kind !== type)) throw new Error("Choose a category for this transaction type.");
  }

  const [inserted] = await store.insert(transactions).values({
    ...(requestId ? { id: requestId } : {}),
    accountId,
    type,
    amount: String(signedAmount),
    currency: account.currency,
    date,
    categoryId,
    description,
    merchant,
    source: "manual",
    ...savings,
    cashbackForId,
  }).onConflictDoNothing({ target: transactions.id }).returning();

  if (!inserted) {
    const [previous] = await store.select().from(transactions).where(eq(transactions.id, requestId!));
    if (!previous || previous.accountId !== accountId || Number(previous.amount) !== signedAmount || previous.type !== type || previous.date.getTime() !== date.getTime() || previous.categoryId !== categoryId || previous.description !== description || Number(previous.discountAmount) !== Number(savings.discountAmount) || Number(previous.cashbackExpected) !== Number(savings.cashbackExpected) || previous.cashbackForId !== cashbackForId) {
      throw new Error("This request was already saved with different details. Check Cash Flow before adding another.");
    }
    return { id: previous.id, currency: previous.currency };
  }

  await store
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${signedAmount}`, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
  return { id: inserted.id, currency: account.currency };
  });

  revalidatePath("/transactions");
  revalidatePath("/savings");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
  return saved;
}

export async function createQuickTransaction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("requestId") ?? "");
  if (!isQuickEntryId(id)) return { error: "Close and reopen Quick entry to start again." };
  if (!["income", "expense"].includes(String(formData.get("type")))) return { error: "Choose income or expense." };
  try {
    manualAmount(String(formData.get("amount") ?? ""));
    manualDate(String(formData.get("date") ?? ""));
  } catch (error) {
    return { error: (error as Error).message };
  }
  const saved = await saveManualTransaction(formData, id);
  return { id: saved.id };
}

export async function undoQuickTransaction(id: string) {
  await requireSession();
  if (!isQuickEntryId(id)) throw new Error("Invalid quick entry.");
  const form = new FormData();
  form.set("id", id);
  await deleteTransaction(form);
}

/**
 * Internal transfer between two of the user's own accounts.
 * Does not count as income/expense. Cross-currency legs retain actual amounts.
 * (PRODUCT_VISION.md §9 / MVP_SPEC.md §4).
 */
export async function createTransfer(formData: FormData) {
  await requireSession();
  const fromAccountId = String(formData.get("fromAccountId"));
  const toAccountId = String(formData.get("toAccountId"));
  const amount = manualAmount(String(formData.get("amount") ?? ""));
  const date = manualDate(String(formData.get("date") ?? ""));
  const description = String(formData.get("description") ?? "").trim() || "Internal transfer";
  const requestId = String(formData.get("requestId") ?? "");
  if (!isQuickEntryId(requestId)) throw new Error("Refresh this page before recording a transfer.");
  if (fromAccountId === toAccountId) throw new Error("Cannot transfer to the same account");

  await db.transaction(async (store) => {
    // Stable account ordering serialises retries and opposite-direction transfers.
    const locked = await store.select().from(accounts)
      .where(inArray(accounts.id, [fromAccountId, toAccountId])).orderBy(asc(accounts.id)).for("update");
    const from = locked.find(a => a.id === fromAccountId);
    const to = locked.find(a => a.id === toAccountId);
    if (!from?.active || !to?.active) throw new Error("Choose two active accounts.");
    const receivedRaw = String(formData.get("receivedAmount") ?? "").trim();
    if (from.currency !== to.currency && !receivedRaw) throw new Error("Enter the amount received in the destination currency.");
    const received = receivedRaw ? manualAmount(receivedRaw) : amount;
    if (from.currency === to.currency && received !== amount) throw new Error("Amounts must match when both accounts use the same currency.");
    const outgoing = { id: requestId, accountId: from.id, type: "transfer", amount: String(-Number(amount)), currency: from.currency, date, description, source: "manual" } as const;
    const incoming = { id: `${requestId}-to`, accountId: to.id, type: "transfer", amount: received, currency: to.currency, date, description, source: "manual" } as const;
    const receiptId = `${requestId}-transfer`;
    const details = JSON.stringify({ fromAccountId, toAccountId, amount, received, date: date.toISOString(), description, fromCurrency: from.currency, toCurrency: to.currency });
    const [receipt] = await store.insert(auditLog).values({ id: receiptId, entityType: "transfer", entityId: requestId, action: "transfer_created", details })
      .onConflictDoNothing({ target: auditLog.id }).returning();
    if (!receipt) {
      const [previous] = await store.select().from(auditLog).where(eq(auditLog.id, receiptId));
      if (previous?.details !== details) throw new Error("This transfer request was already used with different details.");
      const [link] = await store.select().from(transfers).where(eq(transfers.fromTransactionId, requestId));
      if (!link) throw new Error("This transfer has already been deleted.");
      return;
    }
    const [inserted] = await store.insert(transactions).values(outgoing).onConflictDoNothing({ target: transactions.id }).returning();
    if (!inserted) {
      const previous = await store.select().from(transactions).where(inArray(transactions.id, [outgoing.id, incoming.id]));
      const [link] = await store.select().from(transfers).where(eq(transfers.fromTransactionId, outgoing.id));
      const matches = [outgoing, incoming].every(expected => previous.some(row =>
        row.id === expected.id && row.accountId === expected.accountId && row.type === "transfer" &&
        Number(row.amount) === Number(expected.amount) && row.currency === expected.currency &&
        row.date.getTime() === expected.date.getTime() && row.description === expected.description));
      if (!matches || link?.toTransactionId !== incoming.id) throw new Error("This transfer request was already used with different details.");
      return;
    }
    await store.insert(transactions).values(incoming);
    await store.insert(transfers).values({ fromTransactionId: outgoing.id, toTransactionId: incoming.id });
    await store.update(accounts).set({ balance: sql`${accounts.balance} - ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, from.id));
    await store.update(accounts).set({ balance: sql`${accounts.balance} + ${received}`, updatedAt: new Date() }).where(eq(accounts.id, to.id));
  });
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/");
}

/** Expected form failures are returned so production can show translated guidance. */
export async function submitTransfer(formData: FormData) {
  try { await createTransfer(formData); return { saved: true }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expected = [
      "Your session has expired. Sign in again.", "Refresh this page before recording a transfer.",
      "Cannot transfer to the same account", "Choose two active accounts.",
      "Enter a positive amount with at most two decimal places.", "Choose a valid date.",
      "Enter the amount received in the destination currency.",
      "Amounts must match when both accounts use the same currency.",
      "This transfer request was already used with different details.", "This transfer has already been deleted.",
    ];
    return { error: expected.includes(message) ? message : "Could not save. Retry with the same details." };
  }
}

/** Interest counts as income, and updates the account balance (MVP_SPEC.md §3/§6). */
export async function createInterestPayment(formData: FormData) {
  await requireSession();
  const accountId = String(formData.get("accountId"));
  const typed = String(formData.get("amount") ?? "").trim();
  const amount = manualAmount(typed || String(formData.get("computedAmount") ?? ""));
  const date = manualDate(String(formData.get("date") ?? ""));
  const requestId = String(formData.get("requestId") ?? "");
  if (!isQuickEntryId(requestId)) throw new Error("Refresh this page before recording interest.");
  await db.transaction(async store => {
    const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
    if (!account?.active) throw new Error("Choose an active account.");
    const details = JSON.stringify({ accountId, amount, date: date.toISOString(), currency: account.currency });
    const receiptId = `${requestId}-interest`;
    const [receipt] = await store.insert(auditLog).values({ id: receiptId, entityType: "interest", entityId: requestId, action: "interest_recorded", details })
      .onConflictDoNothing({ target: auditLog.id }).returning();
    if (!receipt) {
      const [previous] = await store.select().from(auditLog).where(eq(auditLog.id, receiptId));
      if (previous?.details !== details) throw new Error("This interest request was already used with different details.");
      const [payment] = await store.select({ id: interestPayments.id }).from(interestPayments).where(eq(interestPayments.id, requestId));
      if (!payment) throw new Error("This interest payment has already been deleted.");
      return;
    }
    // Shared ID makes a manually recorded payment removable with its income.
    await store.insert(interestPayments).values({ id: requestId, accountId, amount, date });
    const [interestCategory] = await store.select().from(categories).where(sql`${categories.name} = 'Interest' AND ${categories.kind} = 'income'`);
    await store.insert(transactions).values({ id: requestId, accountId, type: "income", amount, currency: account.currency, date,
      categoryId: interestCategory?.id ?? null, description: "Interest", source: "manual" });
    await store.update(accounts).set({ balance: sql`${accounts.balance} + ${amount}`, updatedAt: new Date() }).where(eq(accounts.id, accountId));
  });
  revalidatePath("/interest"); revalidatePath("/transactions"); revalidatePath("/accounts"); revalidatePath(`/accounts/${accountId}`); revalidatePath("/");
}

export async function submitInterestPayment(formData: FormData) {
  try { await createInterestPayment(formData); return { saved: true }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expected = ["Your session has expired. Sign in again.", "Choose an active account.", "Enter a positive amount with at most two decimal places.", "Choose a valid date.",
      "Refresh this page before recording interest.", "This interest request was already used with different details.", "This interest payment has already been deleted."];
    return { error: expected.includes(message) ? message : "Could not save. Retry with the same details." };
  }
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
  await requireSession();
  const id = String(formData.get("id"));
  const amount = Number(manualAmount(String(formData.get("amount") ?? "")));
  const date = manualDate(String(formData.get("date") ?? ""));
  const categoryId = formData.get("categoryId") ? String(formData.get("categoryId")) : null;
  const description = String(formData.get("description") ?? "");

  const accountId = await db.transaction(async (store) => {
  const [tx] = await store.select().from(transactions).where(eq(transactions.id, id)).for("update");
  if (!tx) throw new Error("Transaction not found");
  if (tx.type === "transfer") throw new Error("Transfers can't be edited — delete and recreate instead");

  const oldAmount = Number(tx.amount);
  const signedAmount = tx.type === "expense" || tx.type === "investment_contribution" ? -Math.abs(amount) : Math.abs(amount);
  const delta = signedAmount - oldAmount;
  const savings = purchaseSavings(tx.type, String(amount), {
    discount: String(formData.get("discountAmount") ?? tx.discountAmount),
    originalPrice: String(formData.get("originalPrice") ?? ""),
    expected: String(formData.get("cashbackExpected") ?? tx.cashbackExpected),
  });
  if (tx.cashbackForId && (Number(savings.discountAmount) || Number(savings.cashbackExpected))) throw new Error("A cashback movement cannot also carry purchase savings.");
  if (categoryId) {
    const [category] = await store.select().from(categories).where(eq(categories.id, categoryId));
    if (!category || (tx.type !== "investment_contribution" && category.kind !== tx.type)) throw new Error("Choose a category for this transaction type.");
  }

  await store
    .update(transactions)
    .set({ amount: String(signedAmount), date, categoryId, description, ...savings })
    .where(eq(transactions.id, id));

  if (delta !== 0) {
    await store
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${delta}`, updatedAt: new Date() })
      .where(eq(accounts.id, tx.accountId));
  }
  return tx.accountId;
  });

  revalidatePath("/transactions");
  revalidatePath("/savings");
  revalidatePath(`/transactions/${id}/edit`);
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/");
}

/**
 * Delete a transaction and reverse its effect on the account balance.
 * If it's one leg of an internal transfer, deletes both legs and reverses
 * both accounts, so a transfer can never be left half-deleted.
 */
export async function deleteTransaction(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id"));
  await db.transaction(async (store) => {
    // Claim the pair before touching either balance. A second delete waits here
    // and then sees no link or movement left to reverse.
    const [link] = await store.select().from(transfers)
      .where(sql`${transfers.fromTransactionId} = ${id} OR ${transfers.toTransactionId} = ${id}`).for("update");
    if (link) {
      const legs = await store.select().from(transactions)
        .where(inArray(transactions.id, [link.fromTransactionId, link.toTransactionId]));
      const accountIds = [...new Set(legs.map(leg => leg.accountId))];
      if (accountIds.length) await store.select({ id: accounts.id }).from(accounts)
        .where(inArray(accounts.id, accountIds)).orderBy(asc(accounts.id)).for("update");
      for (const leg of legs) await store.update(accounts)
        .set({ balance: sql`${accounts.balance} - ${leg.amount}`, updatedAt: new Date() }).where(eq(accounts.id, leg.accountId));
      await store.delete(transfers).where(eq(transfers.id, link.id));
      await store.delete(transactions).where(inArray(transactions.id, [link.fromTransactionId, link.toTransactionId]));
    } else {
      const [removed] = await store.delete(transactions).where(eq(transactions.id, id)).returning();
      if (removed && isQuickEntryId(removed.id)) {
        await store.delete(interestPayments).where(eq(interestPayments.id, removed.id));
      }
      if (removed) await store.update(accounts)
        .set({ balance: sql`${accounts.balance} - ${removed.amount}`, updatedAt: new Date() })
        .where(eq(accounts.id, removed.accountId));
    }
  });

  revalidatePath("/transactions");
  revalidatePath("/interest");
  revalidatePath("/savings");
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
