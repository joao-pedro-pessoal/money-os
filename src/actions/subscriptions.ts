"use server";
import { requireServerSession } from "./requestSession";

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
import { MANUAL_EDIT_RETRY_MESSAGE } from "@/lib/money/manualRequest";
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
  await requireServerSession();
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
  await requireServerSession();
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
  const requestId = await manualRequestId(formData);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new ManualEntryError("Subscription not found");
  await saveSubscription(formData, { id, requestId });
}

export async function submitSubscriptionEdit(formData: FormData) {
  return manualEntryResult(() => updateSubscription(formData), MANUAL_EDIT_RETRY_MESSAGE);
}

function subscriptionValues(formData: FormData) {
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
  return { name, amount, cadence, currency, accountId, categoryId,
    nextChargeAt: date ? manualDate(date) : null,
    notes: String(formData.get("notes") ?? "").trim() || null };
}

async function saveSubscription(formData: FormData, edit?: { id: string; requestId: string }) {
  const id = edit?.id;
  const requestId = edit?.requestId ?? await manualRequestId(formData);
  const recordId = id ?? requestId;

  await db.transaction(async store => {
    const [original] = id === undefined ? [] : await store.select({ nextChargeAt: subscriptions.nextChargeAt })
      .from(subscriptions).where(eq(subscriptions.id, id)).for("update");
    if (id !== undefined && !original) throw new ManualEntryError("Subscription not found");

    const values = subscriptionValues(formData);
    const kind = id === undefined ? "subscription:create" : "subscription:edit";
    if (!(await claimManualRequest(store, requestId, kind, recordId, JSON.stringify(values)))) {
      // A confirmed edit is never replayed, even after the subscription changes again.
      if (id !== undefined) return;
      const [existing] = await store.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, recordId));
      if (!existing) throw new ManualEntryError("This entry has already been deleted.");
      return;
    }

    if (values.accountId) {
      const [account] = await store.select({ active: accounts.active }).from(accounts).where(eq(accounts.id, values.accountId));
      if (!account?.active) throw new ManualEntryError("Choose an active account.");
    }
    if (values.categoryId) {
      const [category] = await store.select({ kind: categories.kind }).from(categories).where(eq(categories.id, values.categoryId));
      if (category?.kind !== "expense") throw new ManualEntryError("Choose an expense category.");
    }

    if (id === undefined) {
      await store.insert(subscriptions).values({ id: recordId, ...values });
    } else {
      // A save that leaves the date alone keeps the original schedule anchor.
      const oldDate = original?.nextChargeAt;
      const nextChargeAt = oldDate && oldDate.toISOString().slice(0, 10) === values.nextChargeAt?.toISOString().slice(0, 10)
        ? oldDate : values.nextChargeAt;
      await store.update(subscriptions).set({ ...values, nextChargeAt, updatedAt: new Date() }).where(eq(subscriptions.id, id));
    }

    await store.insert(auditLog).values({
      entityType: "subscription", entityId: recordId,
      action: id === undefined ? "subscription_created" : "subscription_edited",
      details: JSON.stringify({ name: values.name }),
    });
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
  await requireServerSession();
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
  await requireServerSession();
  const id = String(formData.get("id"));
  await db.delete(subscriptions).where(eq(subscriptions.id, id));
  revalidatePath("/subscriptions");
  revalidatePath("/");
}
