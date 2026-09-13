"use server";

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { accounts, categories, transactions } from '@/db/schema';
import { expectedSessionValue, SESSION_COOKIE_NAME } from '@/lib/auth';
import { assertCashbackLink, purchaseSavings } from '@/lib/money/savings';
import { createQuickTransaction } from './transactions';

async function authorize() {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== await expectedSessionValue()) throw new Error('Sign in again.');
}
function refresh() {
  revalidatePath('/savings');
  revalidatePath('/transactions');
  revalidatePath('/transactions/[id]/edit', 'page');
}

export async function getSavingsData() {
  await authorize();
  const [rows, accountRows, categoryRows] = await Promise.all([
    db.select({ id: transactions.id, type: transactions.type, amount: transactions.amount, currency: transactions.currency,
      date: transactions.date, accountId: transactions.accountId, categoryId: transactions.categoryId,
      description: transactions.description, discountAmount: transactions.discountAmount,
      cashbackExpected: transactions.cashbackExpected, cashbackForId: transactions.cashbackForId,
    }).from(transactions).where(inArray(transactions.type, ['expense', 'income'])).orderBy(desc(transactions.date)),
    db.select({ id: accounts.id, name: accounts.name, currency: accounts.currency, active: accounts.active }).from(accounts),
    db.select({ id: categories.id, name: categories.name, kind: categories.kind }).from(categories),
  ]);
  return { transactions: rows.map(t => ({ ...t, date: t.date.toISOString() })), accounts: accountRows, categories: categoryRows };
}

/** Metadata-only correction, including imported expenses and partial returns. */
export async function updatePurchaseSavings(form: FormData) {
  await authorize();
  const id = String(form.get('id') ?? '');
  await db.transaction(async store => {
    const [purchase] = await store.select().from(transactions).where(eq(transactions.id, id)).for('update');
    if (!purchase || purchase.type !== 'expense' || purchase.cashbackForId) throw new Error('Choose a purchase.');
    const savings = purchaseSavings(purchase.type, purchase.amount, {
      discount: String(form.get('discountAmount') ?? ''), originalPrice: String(form.get('originalPrice') ?? ''),
      expected: String(form.get('cashbackExpected') ?? ''),
    });
    await store.update(transactions).set(savings).where(eq(transactions.id, id));
  });
  refresh();
}

export async function linkCashback(form: FormData) {
  await authorize();
  const id = String(form.get('receiptId') ?? '');
  const purchaseId = String(form.get('purchaseId') ?? '');
  await db.transaction(async store => {
    // Consistent lock order makes concurrent attribution deterministic.
    const rows = await store.select().from(transactions).where(inArray(transactions.id, [id, purchaseId])).orderBy(asc(transactions.id)).for('update');
    const receipt = rows.find(t => t.id === id), purchase = rows.find(t => t.id === purchaseId);
    if (!receipt || !purchase) throw new Error('Movement or purchase no longer exists.');
    const children = await store.select({ id: transactions.id }).from(transactions).where(eq(transactions.cashbackForId, id)).limit(1);
    if (children.length) throw new Error('This movement is already a purchase with cashback.');
    assertCashbackLink({ ...receipt, date: receipt.date.toISOString() }, { ...purchase, date: purchase.date.toISOString() });
    await store.update(transactions).set({ cashbackForId: purchase.id }).where(eq(transactions.id, receipt.id));
  });
  refresh();
}

export async function unlinkCashback(form: FormData) {
  await authorize();
  const id = String(form.get('receiptId') ?? '');
  const purchaseId = String(form.get('purchaseId') ?? '');
  await db.transaction(async store => {
    const [receipt] = await store.select().from(transactions).where(eq(transactions.id, id)).for('update');
    if (receipt?.cashbackForId && receipt.cashbackForId !== purchaseId) throw new Error('This association changed. Refresh the page.');
    await store.update(transactions).set({ cashbackForId: null }).where(eq(transactions.id, id));
  });
  refresh();
}

export async function recordCashback(form: FormData) {
  await authorize();
  if (!String(form.get('cashbackForId') ?? '')) throw new Error('Choose a purchase.');
  const result = await createQuickTransaction(form);
  if (result.error) throw new Error(result.error);
  refresh();
}
