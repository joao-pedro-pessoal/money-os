"use server";

import { db } from "@/db/client";
import { subscriptions, accounts, categories, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ManualEntryError, manualAmount, manualDate } from "@/lib/money/manualEntry";
import { isCurrencyCode } from "@/lib/fx";
import { toBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { claimManualRequest, manualEntryResult, manualRequestId } from "./manualRequest";
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
  await saveSubscription(formData);
}

export async function submitSubscriptionCreation(formData: FormData) {
  return manualEntryResult(() => createSubscription(formData));
}

export async function updateSubscription(formData: FormData) {
  await saveSubscription(formData, String(formData.get("id")));
}

async function saveSubscription(formData: FormData, id?: string) {
  const requestId = id ? null : await manualRequestId(formData);
  const name = String(formData.get("name") ?? "").trim();
  const amount = manualAmount(String(formData.get("amount") ?? ""));
  const cadence = String(formData.get("cadence") ?? "monthly");
  const currency = String(formData.get("currency") ?? "EUR").trim().toUpperCase();
  const accountId = String(formData.get("accountId") ?? "") || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const date = String(formData.get("nextChargeAt") ?? "");
  if (!name) throw new ManualEntryError("A subscription needs a name.");
  if (!isCadence(cadence)) throw new ManualEntryError("Choose a valid billing period.");
  if (!isCurrencyCode(currency)) throw new ManualEntryError("Choose a valid currency.");
  const values = { name, amount, cadence, currency, accountId, categoryId,
    nextChargeAt: date ? manualDate(date) : null,
    notes: String(formData.get("notes") ?? "").trim() || null };
  await db.transaction(async store => {
    if (requestId && !(await claimManualRequest(store,requestId,"subscription:create",requestId,JSON.stringify(values)))) {
      const [existing] = await store.select({id:subscriptions.id}).from(subscriptions).where(eq(subscriptions.id,requestId));
      if (!existing) throw new ManualEntryError("This entry has already been deleted.");
      return;
    }
    if (accountId) {
      const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId));
      if (!account?.active) throw new ManualEntryError("Choose an active account.");
    }
    if (categoryId) {
      const [category] = await store.select().from(categories).where(eq(categories.id, categoryId));
      if (category?.kind !== "expense") throw new ManualEntryError("Choose an expense category.");
    }
    if (id) {
      const [updated] = await store.update(subscriptions).set({ ...values, updatedAt: new Date() }).where(eq(subscriptions.id, id)).returning();
      if (!updated) throw new ManualEntryError("Subscription not found");
    } else {
      await store.insert(subscriptions).values({id:requestId!,...values});
      await store.insert(auditLog).values({entityType:"subscription",entityId:requestId!,action:"subscription_created",details:JSON.stringify({name})});
    }
  });
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
  const desired = String(formData.get("active"));
  if (desired !== "true" && desired !== "false") throw new Error("Choose whether to cancel or resume the subscription.");
  const active = desired === "true";
  await db.transaction(async store => {
    const [row] = await store.select().from(subscriptions).where(eq(subscriptions.id, id)).for("update");
    if (!row) throw new Error("Subscription not found");
    if (row.active === active) return;
    await store.update(subscriptions).set({ active, updatedAt: new Date() }).where(eq(subscriptions.id, id));
    await store.insert(auditLog).values({
      entityType: "subscription", entityId: id,
      action: active ? "subscription_resumed" : "subscription_cancelled",
      details: JSON.stringify({ name: row.name, amount: row.amount, cadence: row.cadence }),
    });
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
