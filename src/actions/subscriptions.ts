"use server";

import { db } from "@/db/client";
import { subscriptions, accounts, categories, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { toBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import {
  totals,
  nextCharge,
  daysUntil,
  monthlyCost,
  yearlyCost,
  byAnnualCost,
  isCadence,
  type Cadence,
  type Subscription,
} from "@/lib/accounting/subscriptions";

function rowToSubscription(r: typeof subscriptions.$inferSelect): Subscription {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    currency: r.currency,
    // A cadence written by an older version or a bad import falls back to
    // monthly rather than producing NaN costs everywhere.
    cadence: isCadence(r.cadence) ? (r.cadence as Cadence) : "monthly",
    active: r.active,
    nextChargeAt: r.nextChargeAt,
    accountId: r.accountId,
    categoryId: r.categoryId,
  };
}

export async function listSubscriptions() {
  const today = new Date();
  const [rows, allAccounts, allCategories, rates, base] = await Promise.all([
    db.select().from(subscriptions),
    db.select().from(accounts),
    db.select().from(categories),
    getRates(),
    getBaseCurrency(),
  ]);

  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(allCategories.map((c) => [c.id, c.name]));

  const subs = byAnnualCost(rows.map(rowToSubscription));

  return subs.map((s) => {
    const due = nextCharge(s.nextChargeAt, s.cadence, today);
    return {
      ...s,
      monthly: monthlyCost(s),
      yearly: yearlyCost(s),
      monthlyInBase: toBase(monthlyCost(s), s.currency, rates, base),
      accountName: s.accountId ? (accountName.get(s.accountId) ?? null) : null,
      categoryName: s.categoryId ? (categoryName.get(s.categoryId) ?? null) : null,
      nextChargeOn: due,
      daysAway: daysUntil(due, today),
      notes: rows.find((r) => r.id === s.id)?.notes ?? null,
    };
  });
}

/**
 * The floor under monthly spending: what leaves whether you act or not.
 *
 * This is a FORECAST, not money that has moved. The charges themselves arrive
 * as ordinary transactions and are counted there — nothing in this figure is
 * ever added to a balance, to spending totals or to Net Worth.
 */
export async function getSubscriptionTotals() {
  const [rows, rates, base] = await Promise.all([
    db.select().from(subscriptions),
    getRates(),
    getBaseCurrency(),
  ]);

  const t = totals(rows.map(rowToSubscription), (amount, currency) =>
    toBase(amount, currency, rates, base)
  );
  return { ...t, baseCurrency: base };
}

export async function createSubscription(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const cadence = String(formData.get("cadence") ?? "monthly");
  const currency = String(formData.get("currency") ?? "EUR");
  const accountId = String(formData.get("accountId") ?? "") || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const nextChargeRaw = String(formData.get("nextChargeAt") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) throw new Error("A subscription needs a name.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter what it costs each time it is charged.");
  }
  if (!isCadence(cadence)) throw new Error(`Unknown billing period: ${cadence}`);

  const nextChargeAt = nextChargeRaw ? new Date(nextChargeRaw) : null;

  await db.insert(subscriptions).values({
    name,
    amount: String(amount),
    currency,
    cadence,
    accountId,
    categoryId,
    nextChargeAt: nextChargeAt && !Number.isNaN(nextChargeAt.getTime()) ? nextChargeAt : null,
    notes,
  });

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

export async function updateSubscription(formData: FormData) {
  const id = String(formData.get("id"));
  const amount = Number(formData.get("amount"));
  const cadence = String(formData.get("cadence") ?? "monthly");

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount.");
  if (!isCadence(cadence)) throw new Error(`Unknown billing period: ${cadence}`);

  const nextChargeRaw = String(formData.get("nextChargeAt") ?? "");
  const nextChargeAt = nextChargeRaw ? new Date(nextChargeRaw) : null;

  await db
    .update(subscriptions)
    .set({
      name: String(formData.get("name") ?? "").trim(),
      amount: String(amount),
      currency: String(formData.get("currency") ?? "EUR"),
      cadence,
      accountId: String(formData.get("accountId") ?? "") || null,
      categoryId: String(formData.get("categoryId") ?? "") || null,
      nextChargeAt: nextChargeAt && !Number.isNaN(nextChargeAt.getTime()) ? nextChargeAt : null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, id));

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

/**
 * Cancelling keeps the row.
 *
 * What you used to pay is the most useful evidence that cancelling worked, and
 * an inactive subscription costs nothing to keep around. Deleting is a separate,
 * explicit action.
 */
export async function toggleSubscription(formData: FormData) {
  const id = String(formData.get("id"));
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
  if (!row) throw new Error("Subscription not found");

  await db
    .update(subscriptions)
    .set({ active: !row.active, updatedAt: new Date() })
    .where(eq(subscriptions.id, id));

  await db.insert(auditLog).values({
    entityType: "subscription",
    entityId: id,
    action: row.active ? "subscription_cancelled" : "subscription_resumed",
    details: JSON.stringify({ name: row.name, amount: row.amount, cadence: row.cadence }),
  });

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

export async function deleteSubscription(formData: FormData) {
  const id = String(formData.get("id"));
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
  revalidatePath("/subscriptions");
  revalidatePath("/");
}
