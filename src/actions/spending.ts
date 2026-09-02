"use server";

import { db } from "@/db/client";
import { transactions, categories, subcategories, accounts } from "@/db/schema";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";
import { toBase } from "@/lib/fx";
import { spendingFilterOptions } from "@/lib/spending/filter";
import type { SpendingRow } from "@/lib/spending/analyse";

/**
 * Every transaction, converted once, ready to be sliced.
 *
 * **Converted before anything is grouped.** `actions/stats.ts` read
 * `transactions.currency` off the row and threw it away, so the moment a
 * foreign expense existed the monthly average, the savings rate, the runway and
 * both projections were adding dollars to euros. That was the tenth appearance
 * of this codebase's oldest bug and this is the same data going to a new page —
 * so the conversion happens here, at the edge, and everything downstream works
 * in one currency.
 *
 * A transaction with no rate is **left out and counted**, never converted to
 * zero: a spend that vanishes flatters the month it was in.
 */
export async function getSpendingAnalysis() {
  const [txRows, categoryRows, subcategoryRows, accountRows, rates, base] = await Promise.all([
    db.select().from(transactions),
    db.select().from(categories),
    db.select().from(subcategories),
    db.select().from(accounts),
    getRates(),
    getBaseCurrency(),
  ]);

  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
  const subcategoryById = new Map(subcategoryRows.map((s) => [s.id, s.name]));
  const accountById = new Map(accountRows.map((a) => [a.id, a.name]));

  const rows: SpendingRow[] = [];
  const missingRateFor = new Set<string>();

  for (const t of txRows) {
    const amount = toBase(Number(t.amount), t.currency, rates, base);
    if (amount === null) {
      missingRateFor.add(t.currency);
      continue;
    }

    const category = t.categoryId === null ? null : categoryById.get(t.categoryId) ?? null;

    rows.push({
      date: new Date(t.date).toISOString(),
      type: t.type,
      amount,
      categoryName: category?.name ?? null,
      subcategoryName:
        t.subcategoryId === null ? null : subcategoryById.get(t.subcategoryId) ?? null,
      accountName: accountById.get(t.accountId) ?? "—",
      merchant: t.merchant,
      /**
       * Fixed lives on the category, not on the transaction, so it is resolved
       * here rather than guessed from the amount. A category nobody has marked
       * counts as variable — the honest default, since calling an unmarked cost
       * committed would overstate what you cannot change.
       */
      fixed: category?.fixed ?? false,
    });
  }

  return {
    baseCurrency: base,
    rows,
    options: spendingFilterOptions(rows),
    /**
     * Currencies with no rate. The rows are missing from every figure on the
     * page, and the page says so rather than presenting a short total as a
     * whole one.
     */
    unconverted: [...missingRateFor].sort(),
    /**
     * True while any row needed converting at all. Rates are today's, so a
     * January expense converted at today's rate is approximate — the same
     * caveat the trade charts carry.
     */
    approximate: txRows.some((t) => t.currency !== base),
    /** How many transactions exist at all, before any filter. */
    total: txRows.length,
  };
}
