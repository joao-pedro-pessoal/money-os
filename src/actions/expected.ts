"use server";

import { db } from "@/db/client";
import { accounts, categories, expectedArrivals, expectedMoney, transactions } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { manualAmount, manualDate, ManualEntryError } from "@/lib/money/manualEntry";
import { MANUAL_EDIT_RETRY_MESSAGE } from "@/lib/money/manualRequest";
import { localDay } from "@/lib/calendar/localDay";
import { claimManualRequest, manualEntryResult, manualRequestId } from "./manualRequest";
import { hasSession } from "./session";
import { isCurrencyCode } from "@/lib/fx";
import { sumInBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import {
  pendingRows,
  arrivingWithin,
  allPendingAmounts,
  isArrival,
  isPending,
  unscheduledFixedIncome,
  anchorFrom,
  anchorInputFor,
  afterArrival,
  afterAddition,
  type Arrival,
  type Expected,
} from "@/lib/accounting/expected";

/** A stored row as the rules read it. Not exported: everything exported from here is an endpoint. */
function shape(r: typeof expectedMoney.$inferSelect): Expected {
  return {
    id: r.id,
    name: r.name,
    amount: Number(r.amount),
    currency: r.currency,
    arrival: isArrival(r.arrival) ? r.arrival : "once",
    expectedAt: r.expectedAt,
    settledAt: r.settledAt,
    active: r.active,
    received: Number(r.received),
    extra: Number(r.extra),
    nextAt: r.nextAt,
  };
}

function refresh(accountId?: string | null) {
  revalidatePath("/expected");
  revalidatePath("/");
  if (!accountId) return;
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
}

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
    accountId: string | null;
    notes: string | null;
  })[] =
    rows.map((r) => ({
      ...shape(r),
      accountName: r.accountId ? accountName.get(r.accountId) ?? null : null,
      categoryName: r.categoryId ? categoryName.get(r.categoryId) ?? null : null,
      categoryId: r.categoryId,
      accountId: r.accountId,
      notes: r.notes,
    }));

  const pending = pendingRows(shaped, new Date());
  const withRow = pending.map((p) => {
    const source = shaped.find((s) => s.id === p.id)!;
    return { ...p, accountName: source.accountName, categoryName: source.categoryName, accountId: source.accountId, categoryId: source.categoryId, notes: source.notes };
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
    accounts: accountRows.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    categories: categoryRows
      .filter((c) => c.kind === "income")
      .map((c) => ({ id: c.id, name: c.name })),
  };
}

/** What the add and edit forms share, checked the same way for both. Not exported: not an endpoint. */
function expectedFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(manualAmount(String(formData.get("amount") ?? "")));
  if (!name) throw new ManualEntryError("Give it a name, so the list says what is coming");

  const raw2 = String(formData.get("arrival") ?? "once");
  if (!isArrival(raw2)) throw new ManualEntryError("Choose a valid arrival period.");
  const arrival = raw2;
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
  const currency = String(formData.get("currency") ?? "EUR").trim().toUpperCase();
  if (!isCurrencyCode(currency)) throw new ManualEntryError("Choose a valid currency.");
  const dateInput = value("expectedAt");
  if (dateInput) manualDate(dateInput);
  for (const [field, max] of [["dayOfMonth", 31], ["weekday", 6]] as const) {
    const input = value(field);
    if (input !== null && (!Number.isInteger(Number(input)) || Number(input) < (field === "dayOfMonth" ? 1 : 0) || Number(input) > max)) throw new ManualEntryError("Choose a valid date.");
  }
  const anchor = { date: value("expectedAt"), dayOfMonth: numberOr("dayOfMonth"), weekday: numberOr("weekday") };
  return { name, amount, arrival, currency, anchor, accountId: value("accountId"), categoryId: value("categoryId"), notes: value("notes") };
}

type Store = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function assertLinks(store: Store, accountId: string | null, categoryId: string | null) {
  if (accountId) {
    const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account?.active) throw new ManualEntryError("Choose an active account.");
  }
  if (categoryId) {
    const [category] = await store.select().from(categories).where(eq(categories.id, categoryId));
    if (category?.kind !== "income") throw new ManualEntryError("Choose an income category.");
  }
}

export async function createExpected(formData: FormData) {
  const { name, amount, arrival, currency, anchor, accountId, categoryId, notes } = expectedFields(formData);
  const expectedAt = anchorFrom(arrival, anchor, new Date());
  await db.transaction(async store => {
    await assertLinks(store, accountId, categoryId);
    await store.insert(expectedMoney).values({
    name,
    amount: amount.toFixed(2),
    currency,
    arrival,
    /**
     * No date is allowed and means "no agreed day". A debt someone owes still
     * counts as coming; nothing pretends to know when, and the windows leave
     * it out rather than guessing at one.
     */
    expectedAt,
    accountId,
    categoryId,
    notes,
  });
  });

  revalidatePath("/expected");
  revalidatePath("/");
}

/** The anchor as the form would ask for it, so saving an untouched form keeps it. */
function keepsAnchor(row: typeof expectedMoney.$inferSelect, arrival: Arrival, anchor: ReturnType<typeof expectedFields>["anchor"]) {
  if (row.arrival !== arrival) return false;
  const kind = anchorInputFor(arrival);
  if (kind === "dayOfMonth") return anchor.dayOfMonth === (row.expectedAt?.getDate() ?? null);
  if (kind === "weekday") return anchor.weekday === (row.expectedAt?.getDay() ?? null);
  return anchor.date === (row.expectedAt ? localDay(row.expectedAt) : null);
}

/**
 * Change what was said about it.
 *
 * What has already arrived stays arrived, so the amount cannot go below it and
 * the currency cannot change under it. A new schedule starts clean.
 */
export async function updateExpected(formData: FormData) {
  const requestId = await manualRequestId(formData);
  const id = String(formData.get("id") ?? "");
  const fields = expectedFields(formData);
  await db.transaction(async store => {
    const [row] = await store.select().from(expectedMoney).where(eq(expectedMoney.id, id)).for("update");
    if (!row) throw new ManualEntryError("This is no longer on your list.");
    if (!(await claimManualRequest(store, requestId, "expected:edit", id, JSON.stringify(fields)))) return;
    if (!isPending(shape(row))) throw new ManualEntryError("This has already arrived or been stopped.");
    await assertLinks(store, fields.accountId, fields.categoryId);
    const received = Number(row.received);
    if (fields.currency !== row.currency && received > 0) throw new ManualEntryError("Part of this has already arrived in its currency. Undo that first.");
    if (fields.amount + Number(row.extra) <= received) throw new ManualEntryError("That is no more than what has already arrived. To close it, say the rest is not coming.");
    const kept = keepsAnchor(row, fields.arrival, fields.anchor);
    await store.update(expectedMoney).set({
      name: fields.name,
      amount: fields.amount.toFixed(2),
      currency: fields.currency,
      arrival: fields.arrival,
      expectedAt: kept ? row.expectedAt : anchorFrom(fields.arrival, fields.anchor, new Date()),
      nextAt: kept ? row.nextAt : null,
      accountId: fields.accountId,
      categoryId: fields.categoryId,
      notes: fields.notes,
      updatedAt: new Date(),
    }).where(eq(expectedMoney.id, id));
  });
  refresh();
}

export async function submitExpectedEdit(formData: FormData) {
  return manualEntryResult(() => updateExpected(formData), MANUAL_EDIT_RETRY_MESSAGE);
}

/** More is coming than was said. See `afterAddition`. */
export async function addToExpected(formData: FormData) {
  const requestId = await manualRequestId(formData);
  const id = String(formData.get("id") ?? "");
  const amount = manualAmount(String(formData.get("amount") ?? ""));
  await db.transaction(async store => {
    const [row] = await store.select().from(expectedMoney).where(eq(expectedMoney.id, id)).for("update");
    if (!row) throw new ManualEntryError("This is no longer on your list.");
    if (!(await claimManualRequest(store, requestId, "expected:more", id, amount))) return;
    if (!isPending(shape(row))) throw new ManualEntryError("This has already arrived or been stopped.");
    const next = afterAddition(shape(row), Number(amount), new Date());
    await store.update(expectedMoney).set({ amount: next.amount.toFixed(2), extra: next.extra.toFixed(2), nextAt: next.nextAt, updatedAt: new Date() }).where(eq(expectedMoney.id, id));
  });
  refresh();
}

export async function submitExpectedAddition(formData: FormData) {
  return manualEntryResult(() => addToExpected(formData));
}

/**
 * It arrived, all of it or some.
 *
 * Put on an account it becomes ordinary income, which is where it is counted;
 * "none" is for money already recorded some other way, such as an imported
 * statement, and then no balance moves. Either way the arrival is kept: what you
 * were owed and when it came is the evidence that it did.
 */
export async function recordExpectedArrival(formData: FormData) {
  const requestId = await manualRequestId(formData);
  const id = String(formData.get("id") ?? "");
  const amount = manualAmount(String(formData.get("amount") ?? ""));
  const at = manualDate(String(formData.get("date") ?? ""));
  const landing = String(formData.get("accountId") ?? "");
  if (!landing) throw new ManualEntryError("Choose where it landed.");
  const accountId = landing === "none" ? null : landing;
  const inAccountRaw = String(formData.get("accountAmount") ?? "").trim();
  const closeRest = formData.get("closeRest") === "on";
  await db.transaction(async store => {
    const [row] = await store.select().from(expectedMoney).where(eq(expectedMoney.id, id)).for("update");
    if (!row) throw new ManualEntryError("This is no longer on your list.");
    const details = JSON.stringify({ amount, at: at.toISOString(), accountId, inAccountRaw, closeRest });
    if (!(await claimManualRequest(store, requestId, "expected:arrival", id, details))) return;
    const current = shape(row);
    if (!isPending(current)) throw new ManualEntryError("This has already arrived or been stopped.");

    let transactionId: string | null = null;
    if (accountId) {
      const [account] = await store.select().from(accounts).where(eq(accounts.id, accountId)).for("update");
      if (!account?.active) throw new ManualEntryError("Choose an active account.");
      // Different currencies: the two actual amounts, as a transfer takes them. No rate is invented.
      if (account.currency !== row.currency && !inAccountRaw) throw new ManualEntryError("Enter the amount received in the destination currency.");
      const inAccount = account.currency === row.currency ? amount : manualAmount(inAccountRaw);
      await store.insert(transactions).values({
        id: requestId,
        accountId,
        type: "income",
        amount: inAccount,
        currency: account.currency,
        date: at,
        categoryId: row.categoryId,
        description: row.name,
        source: "manual",
      });
      await store.update(accounts).set({ balance: sql`${accounts.balance} + ${inAccount}`, updatedAt: new Date() }).where(eq(accounts.id, accountId));
      transactionId = requestId;
    }

    const change = afterArrival(current, Number(amount), at, closeRest);
    await store.insert(expectedArrivals).values({
      id: `${requestId}-arrival`,
      expectedId: id,
      amount,
      currency: row.currency,
      arrivedAt: at,
      accountId,
      transactionId,
      closed: change.closes ? JSON.stringify({ received: row.received, extra: row.extra, nextAt: row.nextAt?.toISOString() ?? null }) : null,
    });
    await store.update(expectedMoney).set({
      received: change.received.toFixed(2),
      extra: change.extra.toFixed(2),
      nextAt: change.nextAt,
      settledAt: change.settledAt,
      updatedAt: new Date(),
    }).where(eq(expectedMoney.id, id));
  });
  refresh(accountId);
}

export async function submitExpectedArrival(formData: FormData) {
  return manualEntryResult(() => recordExpectedArrival(formData));
}

/**
 * Take back the latest arrival of something: the income and its balance go, and
 * it is expected again as it was.
 *
 * Latest first, because each arrival was worked out from the one before.
 */
export async function undoExpectedArrival(formData: FormData) {
  if (!(await hasSession())) throw new ManualEntryError("Sign in again.");
  const id = String(formData.get("id") ?? "");
  const accountId = await db.transaction(async store => {
    const [arrival] = await store.select().from(expectedArrivals).where(eq(expectedArrivals.id, id));
    if (!arrival) return null;
    const [row] = await store.select().from(expectedMoney).where(eq(expectedMoney.id, arrival.expectedId)).for("update");
    const [latest] = await store.select({ id: expectedArrivals.id }).from(expectedArrivals)
      .where(eq(expectedArrivals.expectedId, arrival.expectedId)).orderBy(desc(expectedArrivals.createdAt), desc(expectedArrivals.id)).limit(1);
    if (latest?.id !== arrival.id) throw new ManualEntryError("Undo the most recent arrival first.");

    if (arrival.transactionId) {
      const [income] = await store.select().from(transactions).where(eq(transactions.id, arrival.transactionId));
      if (income) {
        await store.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, income.accountId)).for("update");
        await store.delete(transactions).where(eq(transactions.id, income.id));
        await store.update(accounts).set({ balance: sql`${accounts.balance} - ${income.amount}`, updatedAt: new Date() }).where(eq(accounts.id, income.accountId));
      }
    }
    const before = arrival.closed ? (JSON.parse(arrival.closed) as { received: string; extra: string; nextAt: string | null }) : null;
    await store.update(expectedMoney).set(before
      ? { received: before.received, extra: before.extra, nextAt: before.nextAt ? new Date(before.nextAt) : null, settledAt: null, updatedAt: new Date() }
      : { received: (Number(row.received) - Number(arrival.amount)).toFixed(2), updatedAt: new Date() }
    ).where(eq(expectedMoney.id, arrival.expectedId));
    await store.delete(expectedArrivals).where(eq(expectedArrivals.id, id));
    return arrival.accountId;
  });
  refresh(accountId);
}

/** How many times money that was expected has come, counting what closed before arrivals were recorded. */
export async function countExpectedArrived() {
  const [arrived] = await db.select({ n: sql<number>`count(*)::int` }).from(expectedArrivals);
  const [older] = await db.select({ n: sql<number>`count(*)::int` }).from(expectedMoney)
    .where(sql`${expectedMoney.settledAt} is not null and not exists (select 1 from ${expectedArrivals} where ${expectedArrivals.expectedId} = ${expectedMoney.id})`);
  return arrived.n + older.n;
}

/** The latest arrivals, newest first. Only the newest of each can be undone. */
export async function listExpectedArrivals() {
  const rows = await db
    .select({
      id: expectedArrivals.id,
      expectedId: expectedArrivals.expectedId,
      name: expectedMoney.name,
      amount: expectedArrivals.amount,
      currency: expectedArrivals.currency,
      arrivedAt: expectedArrivals.arrivedAt,
      accountName: accounts.name,
    })
    .from(expectedArrivals)
    .innerJoin(expectedMoney, eq(expectedArrivals.expectedId, expectedMoney.id))
    .leftJoin(accounts, eq(expectedArrivals.accountId, accounts.id))
    .orderBy(desc(expectedArrivals.createdAt), desc(expectedArrivals.id))
    .limit(20);
  const seen = new Set<string>();
  return rows.map((r) => {
    const undoable = !seen.has(r.expectedId);
    seen.add(r.expectedId);
    return { ...r, amount: Number(r.amount), undoable };
  });
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
