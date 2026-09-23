"use server";

import { db } from "@/db/client";
import { accounts, budgetCategories, budgets, categories, transactions, transfers } from "@/db/schema";
import { hasSession } from "./session";
import { getBaseCurrency } from "./settings";
import { documentFromSite, type LeftOut } from "@/lib/vault/import";
import type { VaultDocument } from "@/lib/vault/document";

/**
 * This installation's own records, shaped as a vault document.
 *
 * Only the owner can ask: it is guarded by the site's session, the same one
 * every page is behind. What comes back goes nowhere near the server again —
 * the browser encrypts it with the vault's twelve words and stores ciphertext.
 *
 * Nothing here deletes or changes anything. Moving into a vault leaves the
 * site's tables exactly as they were, so the two can be compared afterwards
 * and the move can be undone by simply not using the vault.
 */
export async function siteAsVaultDocument(): Promise<{ document: VaultDocument; leftOut: LeftOut[] }> {
  if (!(await hasSession())) {
    throw new Error("Only this Money OS's owner can bring its records into a vault. Sign in to the site first.");
  }

  const [accountRows, categoryRows, transactionRows, transferRows, budgetRows, budgetCategoryRows, baseCurrency] =
    await Promise.all([
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(transactions),
      db.select().from(transfers),
      db.select().from(budgets),
      db.select().from(budgetCategories),
      getBaseCurrency(),
    ]);

  const categoriesOf = new Map<string, string[]>();
  for (const row of budgetCategoryRows) {
    categoriesOf.set(row.budgetId, [...(categoriesOf.get(row.budgetId) ?? []), row.categoryId]);
  }

  return documentFromSite({
    baseCurrency,
    accounts: accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      accountType: a.accountType,
      currency: a.currency,
      balance: String(a.balance),
      active: a.active,
      createdAt: a.createdAt,
    })),
    categories: categoryRows.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    transactions: transactionRows.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      type: t.type,
      amount: String(t.amount),
      currency: t.currency,
      date: t.date,
      categoryId: t.categoryId,
      merchant: t.merchant,
      description: t.description,
    })),
    transfers: transferRows.map((t) => ({ fromTransactionId: t.fromTransactionId, toTransactionId: t.toTransactionId })),
    budgets: budgetRows.map((b) => ({
      id: b.id,
      name: b.name,
      period: b.period,
      limitAmount: String(b.limitAmount),
      active: b.active,
      categoryIds: categoriesOf.get(b.id) ?? [],
    })),
  });
}
