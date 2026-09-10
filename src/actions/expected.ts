"use server";

import { db } from "@/db/client";
import { accounts, categories, expectedMoney } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sumInBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import {
  pendingRows,
  arrivingWithin,
  allPendingAmounts,
  isArrival,
  unscheduledFixedIncome,
  anchorFrom,
  type Expected,
} from "@/lib/accounting/expected";

/**
 * Money that is coming but has not arrived.
 *
 * Nothing in this file is added to Net Worth, to an account balance, or to any
 * income total, and nothing imports it into one. The figures below are shown
 * beside what you have, never inside it. See `lib/accounting/expected.ts`.
 */
export async function listExpected() {
  const [rows, accountRows, categoryRows, rates, base] = await Promise.all([
    db.select().from(expectedMoney),
    db.select().from(accounts),
    db.select().from(categories),
    getRates(),
    getBaseCurrency(),
  ]);

  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  const shaped: (Expected & {
    accountName: string | null;
    categoryName: string | null;
    categoryId: string | null;
  })[] =
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      amount: Number(r.amount),
      currency: r.currency,
      arrival: isArrival(r.arrival) ? r.arrival : "once",
      expectedAt: r.expectedAt,
      settledAt: r.settledAt,
      active: r.active,
      accountName: r.accountId ? accountName.get(r.accountId) ?? null : null,
      categoryName: r.categoryId ? categoryName.get(r.categoryId) ?? null : null,
      categoryId: r.categoryId,
    }));

  const pending = pendingRows(shaped, new Date());
  const withRow = pending.map((p) => {
    const source = shaped.find((s) => s.id === p.id)!;
    return { ...p, accountName: source.accountName, categoryName: source.categoryName };
  });

  /**
   * Converted here, because this is the layer with rates — and through
   * `sumInBase`, which reports what it could not convert instead of counting
   * it as nothing.
   */
  const soon = sumInBase(arrivingWithin(pending, 30), rates, base);
  const all = sumInBase(allPendingAmounts(pending), rates, base);

  return {
    rows: withRow,
    /**
     * Fixed income named but never scheduled.
     *
     * A category marked "fixed" says this kind of money arrives whether you act
     * or not — and says nothing about how much or when. Rather than invent
     * both, the page asks, with the one thing it does know filled in.
     */
    unscheduled: unscheduledFixedIncome(categoryRows, shaped),
    /** Dated inside the next 30 days. */
    within30: soon.total,
    /** Everything still coming, dated or not. */
    total: all.total,
    /** Amounts left out of both, and why the totals are not the whole picture. */
    unconverted: all.unconverted,
    settled: shaped.filter((s) => s.settledAt !== null).length,
    baseCurrency: base,
  };
}

/** Everything the form offers, so a page need not fetch it twice. */
export async function listExpectedOptions() {
  const [accountRows, categoryRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)),
    db.select().from(categories),
  ]);
  return {
    accounts: accountRows.map((a) => ({ id: a.id, name: a.name })),
    categories: categoryRows
      .filter((c) => c.kind === "income")
      .map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function createExpected(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const raw = String(formData.get("amount") ?? "").trim().replace(",", ".");
  const amount = Number(raw);

  if (!name) throw new Error("Give it a name, so the list says what is coming");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("An amount that isn't a positive number is not money coming in");
  }

  const raw2 = String(formData.get("arrival") ?? "once");
  const arrival = isArrival(raw2) ? raw2 : "once";
  const value = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v === "" ? null : v;
  };
  const numberOr = (key: string): number | null => {
    const v = value(key);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  /**
   * The anchor is built from whichever field the cadence asked for.
   *
   * A monthly salary is collected as "the 25th" and a weekly one as "Friday",
   * because that is what those cadences mean — the year and month are noise you
   * would have to pick anyway. `anchorFrom` fills the rest in from today,
   * forwards, so nothing lands in the past the moment it is set up.
   */
  const expectedAt = anchorFrom(
    arrival,
    {
      date: value("expectedAt"),
      dayOfMonth: numberOr("dayOfMonth"),
      weekday: numberOr("weekday"),
    },
    new Date()
  );

  await db.insert(expectedMoney).values({
    name,
    amount: amount.toFixed(2),
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    arrival,
    /**
     * No date is allowed and means "no agreed day". A debt someone owes still
     * counts as coming; nothing pretends to know when, and the windows leave
     * it out rather than guessing at one.
     */
    expectedAt,
    accountId: value("accountId"),
    categoryId: value("categoryId"),
    notes: value("notes"),
  });

  revalidatePath("/expected");
  revalidatePath("/");
}

/**
 * It arrived.
 *
 * Recorded rather than deleted: what you were owed and when it came is the
 * evidence that it did. The money itself becomes an ordinary transaction, which
 * is where it is counted — this only stops it being expected.
 */
export async function markExpectedReceived(formData: FormData) {
  const id = String(formData.get("id"));
  await db
    .update(expectedMoney)
    .set({ settledAt: new Date(), updatedAt: new Date() })
    .where(eq(expectedMoney.id, id));

  revalidatePath("/expected");
  revalidatePath("/");
}

/** Stop expecting a recurring one, without erasing that it existed. */
export async function stopExpected(formData: FormData) {
  const id = String(formData.get("id"));
  await db
    .update(expectedMoney)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(expectedMoney.id, id));

  revalidatePath("/expected");
  revalidatePath("/");
}

export async function deleteExpected(formData: FormData) {
  await db.delete(expectedMoney).where(eq(expectedMoney.id, String(formData.get("id"))));
  revalidatePath("/expected");
  revalidatePath("/");
}
