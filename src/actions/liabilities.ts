"use server";

import { db } from "@/db/client";
import { liabilities, accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { toBase } from "@/lib/fx";
import { LIABILITY_KINDS, monthlyInterest, payoffMonths } from "@/lib/accounting/liabilities";

/**
 * Everything you owe, with what it costs you to owe it.
 *
 * Amounts are converted before any of them are added, as everywhere else: a
 * dollar loan beside a euro one summed raw is a number in no currency at all.
 */
export async function listLiabilities() {
  const [rows, accountRows, rates, base] = await Promise.all([
    db.select().from(liabilities),
    db.select().from(accounts),
    getRates(),
    getBaseCurrency(),
  ]);

  const accountName = new Map(accountRows.map((a) => [a.id, a.name]));

  const items = rows.map((l) => {
    const balance = Number(l.balance);
    const apr = l.apr === null ? null : Number(l.apr);
    const monthlyPayment = l.monthlyPayment === null ? null : Number(l.monthlyPayment);
    const inBase = toBase(balance, l.currency, rates, base);

    return {
      id: l.id,
      name: l.name,
      kind: l.kind,
      balance,
      currency: l.currency,
      /** Null when nothing could convert it — left out of totals, never zeroed. */
      balanceInBase: inBase,
      apr,
      monthlyPayment,
      endsOn: l.endsOn,
      accountId: l.accountId,
      accountName: l.accountId ? accountName.get(l.accountId) ?? null : null,
      notes: l.notes,
      active: l.active,
      /** What owing this costs you this month, before any repayment. */
      monthlyInterest: monthlyInterest(balance, apr),
      /** How long at the current payment, or null when it never clears. */
      payoffMonths: payoffMonths(balance, apr, monthlyPayment),
    };
  });

  const counted = items.filter((i) => i.active && i.accountId === null);

  return {
    items: items.sort((a, b) => (b.balanceInBase ?? 0) - (a.balanceInBase ?? 0)),
    baseCurrency: base,
    /** The figure net worth subtracts. Excludes debts an account already shows. */
    totalOwed:
      Math.round((counted.reduce((s, i) => s + (i.balanceInBase ?? 0), 0) + Number.EPSILON) * 100) /
      100,
    /** Interest accruing across everything, per month. */
    monthlyInterestTotal:
      Math.round(
        (counted.reduce((s, i) => {
          const converted = toBase(i.monthlyInterest ?? 0, i.currency, rates, base);
          return s + (converted ?? 0);
        }, 0) +
          Number.EPSILON) *
          100
      ) / 100,
    /** Rows nothing could convert, named rather than silently dropped. */
    unconverted: items.filter((i) => i.balanceInBase === null).length,
    accounts: accountRows.map((a) => ({ id: a.id, name: a.name })),
    kinds: LIABILITY_KINDS,
  };
}

function optionalNumber(formData: FormData, field: string): string | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : null;
}

function revalidate() {
  // Net worth is on all of these, and a debt changes it.
  revalidatePath("/liabilities");
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/accounts");
}

export async function createLiability(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Give it a name — you'll want to recognise it later.");

  const balance = optionalNumber(formData, "balance") ?? "0";
  if (Number(balance) < 0) {
    // A negative debt is an asset, and letting one in would add money to net
    // worth through the field that exists to take it away.
    throw new Error("A balance owed cannot be negative. Enter what you still owe.");
  }

  const accountId = String(formData.get("accountId") ?? "").trim();

  await db.insert(liabilities).values({
    name,
    kind: String(formData.get("kind") ?? "other"),
    balance,
    currency: String(formData.get("currency") ?? "EUR").toUpperCase(),
    apr: optionalNumber(formData, "apr"),
    monthlyPayment: optionalNumber(formData, "monthlyPayment"),
    accountId: accountId === "" ? null : accountId,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  revalidate();
}

export async function updateLiability(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Which debt?");

  const balance = optionalNumber(formData, "balance") ?? "0";
  if (Number(balance) < 0) {
    throw new Error("A balance owed cannot be negative. Enter what you still owe.");
  }

  const accountId = String(formData.get("accountId") ?? "").trim();

  await db
    .update(liabilities)
    .set({
      balance,
      apr: optionalNumber(formData, "apr"),
      monthlyPayment: optionalNumber(formData, "monthlyPayment"),
      accountId: accountId === "" ? null : accountId,
      updatedAt: new Date(),
    })
    .where(eq(liabilities.id, id));

  revalidate();
}

export async function deleteLiability(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Which debt?");
  await db.delete(liabilities).where(eq(liabilities.id, id));
  revalidate();
}
