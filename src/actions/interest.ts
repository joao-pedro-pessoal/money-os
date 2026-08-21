"use server";

import { db } from "@/db/client";
import { accounts, interestPayments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  expectedSince,
  compare,
  perDay,
  effectiveAnnualRate,
  type DayCount,
} from "@/lib/accounting/interest";

function dayCountOf(value: string | null): DayCount {
  return Number(value) === 360 ? 360 : 365;
}

/**
 * Accounts that pay interest, with what they should have earned by now.
 *
 * The point is the comparison. Recording what the bank said only builds a list;
 * computing what the rate implies turns that list into something that can catch
 * a rate applied late or a payment that never arrived.
 */
export async function getInterestOutlook() {
  const [allAccounts, payments] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.active, true)),
    db.select().from(interestPayments).orderBy(desc(interestPayments.date)),
  ]);

  const today = new Date();

  return allAccounts
    .filter((a) => a.apr !== null && Number(a.apr) > 0)
    .map((a) => {
      const apr = Number(a.apr);
      const balance = Number(a.balance);
      const dayCount = dayCountOf(a.aprDayCount);
      const withholding =
        a.interestWithholdingPercent === null ? 0 : Number(a.interestWithholdingPercent);

      const mine = payments.filter((p) => p.accountId === a.id);
      const lastPaid = mine.length > 0 ? new Date(mine[0].date) : null;
      // Nothing paid yet means "since the account existed" — the only honest
      // starting point, even if it produces a large first figure.
      const since = lastPaid ?? new Date(a.createdAt);

      const accrual = expectedSince({
        balance,
        aprPercent: apr,
        since,
        until: today,
        dayCount,
        withholdingPercent: withholding,
      });

      return {
        accountId: a.id,
        name: a.name,
        currency: a.currency,
        balance,
        apr,
        dayCount,
        withholding,
        lastPaid,
        since,
        accrual,
        perDay: perDay(balance, apr, dayCount),
        // What the rate is really worth if it's paid monthly.
        effectiveMonthly: effectiveAnnualRate(apr, 12),
        lastAmount: mine.length > 0 ? Number(mine[0].amount) : null,
      };
    });
}

/**
 * What one account should have earned between two dates.
 *
 * Used by the form to fill the amount in, so the number you record is one you
 * can see the arithmetic for.
 */
export async function calculateInterest(accountId: string, fromISO: string, toISO: string) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a) throw new Error("Account not found");
  if (a.apr === null) throw new Error("This account has no rate set. Add one on the account first.");

  const from = new Date(fromISO);
  const to = new Date(toISO);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("Bad dates.");

  const accrual = expectedSince({
    balance: Number(a.balance),
    aprPercent: Number(a.apr),
    since: from,
    until: to,
    dayCount: dayCountOf(a.aprDayCount),
    withholdingPercent:
      a.interestWithholdingPercent === null ? 0 : Number(a.interestWithholdingPercent),
  });

  return {
    ...accrual,
    balance: Number(a.balance),
    apr: Number(a.apr),
    currency: a.currency,
    dayCount: dayCountOf(a.aprDayCount),
  };
}

/** Compares a payment against what the rate implies, for the history table. */
export async function checkPayment(accountId: string, amount: number, from: Date, to: Date) {
  const [a] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  if (!a || a.apr === null) return null;

  const accrual = expectedSince({
    balance: Number(a.balance),
    aprPercent: Number(a.apr),
    since: from,
    until: to,
    dayCount: dayCountOf(a.aprDayCount),
    withholdingPercent:
      a.interestWithholdingPercent === null ? 0 : Number(a.interestWithholdingPercent),
  });

  return compare(accrual.net, amount);
}

export async function setAccountRate(formData: FormData) {
  const id = String(formData.get("accountId"));
  const raw = String(formData.get("apr") ?? "").trim();
  const apr = raw === "" ? null : Number(raw);

  if (apr !== null && (!Number.isFinite(apr) || apr < 0)) {
    throw new Error("A rate cannot be negative.");
  }

  const withholdingRaw = String(formData.get("withholding") ?? "").trim();
  const withholding = withholdingRaw === "" ? null : Number(withholdingRaw);
  if (withholding !== null && (!Number.isFinite(withholding) || withholding < 0 || withholding > 100)) {
    throw new Error("Withholding must be between 0 and 100.");
  }

  await db
    .update(accounts)
    .set({
      apr: apr === null ? null : String(apr),
      aprDayCount: String(dayCountOf(String(formData.get("dayCount") ?? "365"))),
      interestWithholdingPercent: withholding === null ? null : String(withholding),
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, id));

  revalidatePath("/interest");
  revalidatePath(`/accounts/${id}`);
}
