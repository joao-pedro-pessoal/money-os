"use server";

import { db } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { sumInBase } from "@/lib/fx";
import { chargesUntil, daysLeftInMonth, endOfMonth, monthAhead, type MonthAhead } from "@/lib/accounting/monthAhead";
import { isCadence } from "@/lib/accounting/subscriptions";
import { getBudgetsLeft } from "./budgets";
import { listExpected } from "./expected";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";

/**
 * What is due to leave and to arrive between today and the end of the month,
 * in the base currency: subscriptions by the charges that fall in it,
 * budgets by what they have left, and money coming in by what is dated
 * inside it — or overdue, since it has not arrived yet either.
 */
export async function getMonthAhead(): Promise<MonthAhead> {
  const today = new Date();
  const end = endOfMonth(today);
  const [rows, budgets, expected, rates, base] = await Promise.all([
    db.select().from(subscriptions),
    getBudgetsLeft(),
    listExpected(),
    getRates(),
    getBaseCurrency(),
  ]);

  const charges = rows.flatMap((r) =>
    chargesUntil(
      { cadence: isCadence(r.cadence) ? r.cadence : "monthly", nextChargeAt: r.nextChargeAt, active: r.active },
      today,
      end
    ).map(() => ({ amount: Number(r.amount), currency: r.currency }))
  );
  const out = sumInBase(charges, rates, base);

  const days = daysLeftInMonth(today);
  const arriving = expected.rows.filter((r) => r.inDays !== null && r.inDays <= days);
  const coming = sumInBase(
    arriving.map((r) => ({ amount: r.amount, currency: r.currency })),
    rates,
    base
  );

  return monthAhead({
    end,
    subscriptions: { total: out.total, count: charges.length },
    budgets: budgets,
    comingIn: { total: coming.total, count: arriving.length },
    unconverted: out.unconverted.length + coming.unconverted.length,
  });
}
