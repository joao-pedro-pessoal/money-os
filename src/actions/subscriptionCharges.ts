"use server";

import { db } from "@/db/client";
import { accounts, auditLog, categories, subscriptionCharges, subscriptions, transactions } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { expectedSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";
import { isCadence } from "@/lib/accounting/subscriptions";
import {
  LOOKBACK_DAYS,
  MATCH_DAYS,
  dayKey,
  likelyMatch,
  pendingCharges,
} from "@/lib/accounting/subscriptionCharges";
import { manualAmount, manualDate } from "@/lib/money/manualEntry";
import { getDefaultAccountId } from "./settings";

async function requireSession() {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== (await expectedSessionValue())) {
    throw new Error("Your session has expired. Sign in again.");
  }
}

function revalidate() {
  for (const path of ["/", "/subscriptions", "/transactions", "/accounts", "/analytics/report"]) {
    revalidatePath(path);
  }
}

export interface DueCharge {
  subscriptionId: string;
  dueOn: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  /** The account the subscription names, else the default account, else null. */
  accountId: string | null;
  accountCurrency: string | null;
  /** An expense already in the ledger that looks like this charge. */
  match: { id: string; date: string; amount: number; currency: string; label: string; accountName: string } | null;
}

/**
 * Subscription charges that have fallen due and not been answered, oldest first,
 * each with the expense that may already be it.
 */
export async function getDueSubscriptionCharges(): Promise<{ charges: DueCharge[]; accounts: { id: string; name: string; currency: string }[] }> {
  const today = new Date();
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - LOOKBACK_DAYS - MATCH_DAYS);

  const [subRows, handledRows, accountRows, categoryRows, ledgerRows, defaultAccountId] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.active, true)),
    db.select().from(subscriptionCharges),
    db.select({ id: accounts.id, name: accounts.name, currency: accounts.currency }).from(accounts).where(eq(accounts.active, true)),
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select().from(transactions).where(and(eq(transactions.type, "expense"), gte(transactions.date, since))),
    getDefaultAccountId(),
  ]);

  const handled = new Set(handledRows.map((c) => `${c.subscriptionId}|${c.dueOn}`));
  const claimed = new Set(handledRows.map((c) => c.transactionId).filter((id): id is string => id !== null));
  const byId = new Map(subRows.map((s) => [s.id, s]));
  const accountById = new Map(accountRows.map((a) => [a.id, a]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));
  const ledger = ledgerRows.map((t) => ({
    id: t.id,
    date: t.date,
    amount: Number(t.amount),
    currency: t.currency,
    accountId: t.accountId,
    type: t.type,
    description: t.description,
    merchant: t.merchant,
  }));

  const pending = pendingCharges(
    subRows.map((s) => ({
      id: s.id,
      name: s.name,
      amount: Number(s.amount),
      currency: s.currency,
      cadence: isCadence(s.cadence) ? s.cadence : "monthly",
      active: s.active,
      nextChargeAt: s.nextChargeAt,
      createdAt: s.createdAt,
    })),
    handled,
    today
  );

  const charges = pending.map((p) => {
    const s = byId.get(p.subscriptionId)!;
    const amount = Number(s.amount);
    const account = (s.accountId && accountById.get(s.accountId)) || (defaultAccountId ? accountById.get(defaultAccountId) : undefined) || null;
    const found = likelyMatch(
      { name: s.name, amount, currency: s.currency, accountId: s.accountId, dueOn: p.dueOn },
      ledger,
      claimed
    );
    // One expense answers one charge: the next proposal must not offer it again.
    if (found) claimed.add(found.id);
    return {
      subscriptionId: s.id,
      dueOn: p.dueOn,
      name: s.name,
      amount,
      currency: s.currency,
      categoryId: s.categoryId,
      categoryName: s.categoryId ? categoryName.get(s.categoryId) ?? null : null,
      accountId: account?.id ?? null,
      accountCurrency: account?.currency ?? null,
      match: found
        ? {
            id: found.id,
            // The local day, as the match was judged; the UTC one can be the day before.
            date: dayKey(found.date),
            amount: Math.abs(found.amount),
            currency: found.currency,
            label: found.merchant || found.description || "Expense",
            accountName: accountById.get(found.accountId)?.name ?? "—",
          }
        : null,
    };
  });

  return { charges, accounts: accountRows };
}

type Result = { ok: true } | { error: string };

/**
 * Records the charge as an expense, once.
 *
 * The charge row is written first, inside the same database transaction, and
 * its unique (subscription, day) pair is the guard: a double tap, a reload or a
 * second device finds it already there and creates nothing.
 */
export async function recordSubscriptionCharge(formData: FormData): Promise<Result> {
  await requireSession();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const dueOn = String(formData.get("dueOn") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  let amount: number;
  let date: Date;
  try {
    manualDate(dueOn);
    amount = Number(manualAmount(String(formData.get("amount") ?? "")));
    date = manualDate(String(formData.get("date") ?? dueOn));
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!accountId) return { error: "Choose the account it was charged to." };

  try {
    await db.transaction(async (store) => {
      const [sub] = await store.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
      if (!sub) throw new Error("Subscription not found.");
      const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
      if (!account?.active) throw new Error("Choose an active account.");

      const [charge] = await store
        .insert(subscriptionCharges)
        .values({ subscriptionId, dueOn, status: "recorded" })
        .onConflictDoNothing()
        .returning();
      if (!charge) throw new Error("This charge was already answered.");

      let categoryId = sub.categoryId;
      if (categoryId) {
        const [category] = await store.select().from(categories).where(eq(categories.id, categoryId));
        if (!category || category.kind !== "expense") categoryId = null;
      }

      const [inserted] = await store
        .insert(transactions)
        .values({
          accountId,
          type: "expense",
          // Typed in the account's currency, like every manual expense.
          amount: String(-Math.abs(amount)),
          currency: account.currency,
          date,
          categoryId,
          merchant: sub.name,
          description: `${sub.name} (subscription)`,
          isRecurring: true,
          source: "manual",
        })
        .returning();

      await store
        .update(accounts)
        .set({ balance: sql`${accounts.balance} + ${-Math.abs(amount)}`, updatedAt: new Date() })
        .where(eq(accounts.id, accountId));
      await store.update(subscriptionCharges).set({ transactionId: inserted.id }).where(eq(subscriptionCharges.id, charge.id));
      await store.insert(auditLog).values({
        entityType: "subscription",
        entityId: subscriptionId,
        action: "subscription_charge_recorded",
        details: JSON.stringify({ dueOn, amount, currency: account.currency, transactionId: inserted.id }),
      });
    });
  } catch (error) {
    return { error: (error as Error).message };
  }
  revalidate();
  return { ok: true };
}

/**
 * Answers a charge without creating anything: it is already in the ledger
 * (`matched`, with the expense it was), or it did not happen (`skipped`).
 */
export async function answerSubscriptionCharge(formData: FormData): Promise<Result> {
  await requireSession();
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  const dueOn = String(formData.get("dueOn") ?? "");
  const answer = String(formData.get("answer") ?? "");
  const transactionId = String(formData.get("transactionId") ?? "") || null;
  try {
    manualDate(dueOn);
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (answer !== "matched" && answer !== "skipped") return { error: "Unknown answer." };
  if (answer === "matched" && !transactionId) return { error: "Choose the expense it was." };

  try {
    await db.transaction(async (store) => {
      const [sub] = await store.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, subscriptionId));
      if (!sub) throw new Error("Subscription not found.");
      if (answer === "matched") {
        // The expense may have been deleted since the page was drawn.
        const [expense] = await store
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.id, transactionId!), eq(transactions.type, "expense")));
        if (!expense) throw new Error("That expense is no longer there. Reload and choose again.");
      }
      const [row] = await store
        .insert(subscriptionCharges)
        .values({ subscriptionId, dueOn, status: answer, transactionId: answer === "matched" ? transactionId : null })
        .onConflictDoNothing()
        .returning();
      if (!row) throw new Error("This charge was already answered.");
      await store.insert(auditLog).values({
        entityType: "subscription",
        entityId: subscriptionId,
        action: answer === "matched" ? "subscription_charge_matched" : "subscription_charge_skipped",
        details: JSON.stringify({ dueOn, transactionId }),
      });
    });
  } catch (error) {
    return { error: (error as Error).message };
  }
  revalidate();
  return { ok: true };
}
