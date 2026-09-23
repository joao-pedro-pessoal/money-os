/**
 * What a month in a vault looks like: what came in, what went out, and where
 * it went.
 *
 * Two rules the site's own reports already follow, kept here because a vault
 * has its own data and would otherwise grow its own answers:
 *
 * **A transfer is not spending.** Money moved between your own accounts was
 * neither earned nor spent, and counting it doubles both sides of the month.
 *
 * **What has no category is named, not hidden.** An expense with no category
 * is shown as "Uncategorised" with its amount, so the parts always add up to
 * the total — a breakdown that quietly drops rows is one you cannot check.
 */

import { cents, fromCents, type VaultDocument, type VaultMovement } from "./document";

/** YYYY-MM of a day, as the movements store it. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export const UNCATEGORISED = "Uncategorised";

export interface CategoryLine {
  name: string;
  /** Positive: what was spent (or received) under this name. */
  amount: string;
  /** Share of the month's spending (or income), 0–100. */
  percent: number;
  movements: number;
}

export interface MonthReport {
  month: string;
  income: string;
  spent: string;
  /** income − spent. Negative means the month cost more than it brought in. */
  net: string;
  /** Spending by category, largest first, with what has none last. */
  byCategory: CategoryLine[];
  /** Money moved between your own accounts: shown, never counted as spending. */
  transferred: string;
  /** Currencies other than the one asked for, left out of these totals. */
  leftOut: string[];
}

function lines(rows: VaultMovement[], nameOf: (id: string | null) => string): CategoryLine[] {
  const totals = new Map<string, { amount: number; movements: number }>();
  for (const row of rows) {
    const name = nameOf(row.categoryId);
    const entry = totals.get(name) ?? { amount: 0, movements: 0 };
    entry.amount += cents(row.amount);
    entry.movements += 1;
    totals.set(name, entry);
  }
  const total = [...totals.values()].reduce((sum, e) => sum + e.amount, 0);
  return [...totals]
    .map(([name, e]) => ({
      name,
      amount: fromCents(e.amount),
      percent: total === 0 ? 0 : (e.amount / total) * 100,
      movements: e.movements,
    }))
    .sort(
      (a, b) =>
        Number(a.name === UNCATEGORISED) - Number(b.name === UNCATEGORISED) ||
        cents(b.amount) - cents(a.amount)
    );
}

/**
 * One month of the vault, in one currency.
 *
 * Only accounts in `currencyCode` take part: adding euros to dollars needs a
 * rate, and a rate invented inside a report is a figure nobody can check. The
 * currencies left out are named.
 */
export function monthReport(doc: VaultDocument, month: string, currencyCode?: string): MonthReport {
  const currency = (currencyCode ?? doc.baseCurrency).toUpperCase();
  const accounts = new Map(doc.accounts.map((a) => [a.id, a]));
  const categoryName = new Map(doc.categories.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) => (id === null ? UNCATEGORISED : categoryName.get(id) ?? UNCATEGORISED);

  const inMonth = doc.movements.filter(
    (m) => monthOf(m.date) === month && accounts.get(m.accountId)?.currency === currency
  );
  const income = inMonth.filter((m) => m.type === "income");
  const spent = inMonth.filter((m) => m.type === "expense");
  const transferredOut = inMonth.filter((m) => m.type === "transfer" && m.transferOut === true);

  const sum = (rows: VaultMovement[]) => rows.reduce((total, m) => total + cents(m.amount), 0);
  const incomeTotal = sum(income);
  const spentTotal = sum(spent);

  return {
    month,
    income: fromCents(incomeTotal),
    spent: fromCents(spentTotal),
    net: fromCents(incomeTotal - spentTotal),
    byCategory: lines(spent, nameOf),
    transferred: fromCents(sum(transferredOut)),
    leftOut: [...new Set(doc.accounts.filter((a) => a.currency !== currency).map((a) => a.currency))].sort(),
  };
}

/** Income by category for the same month, for the other half of the picture. */
export function incomeByCategory(doc: VaultDocument, month: string, currencyCode?: string): CategoryLine[] {
  const currency = (currencyCode ?? doc.baseCurrency).toUpperCase();
  const accounts = new Map(doc.accounts.map((a) => [a.id, a]));
  const categoryName = new Map(doc.categories.map((c) => [c.id, c.name]));
  return lines(
    doc.movements.filter(
      (m) => m.type === "income" && monthOf(m.date) === month && accounts.get(m.accountId)?.currency === currency
    ),
    (id) => (id === null ? UNCATEGORISED : categoryName.get(id) ?? UNCATEGORISED)
  );
}

/** Every month with something in it, newest first: what the month picker offers. */
export function monthsWithMovements(doc: VaultDocument): string[] {
  return [...new Set(doc.movements.map((m) => monthOf(m.date)))].sort().reverse();
}

export interface BudgetLine {
  categoryId: string;
  name: string;
  period: "monthly" | "yearly";
  limit: string;
  spent: string;
  /** Spent ÷ limit, 0–100 and beyond. */
  percent: number;
  status: "under" | "close" | "over";
}

/**
 * Each budget against what that category cost this month.
 *
 * "Close" starts at 80%: far enough in to be worth knowing and early enough to
 * change something. A yearly budget is compared against the year's spending,
 * not a twelfth of it — that is what makes it a yearly one.
 */
export function budgetLines(doc: VaultDocument, month: string, currencyCode?: string): BudgetLine[] {
  const currency = (currencyCode ?? doc.baseCurrency).toUpperCase();
  const accounts = new Map(doc.accounts.map((a) => [a.id, a]));
  const categoryName = new Map(doc.categories.map((c) => [c.id, c.name]));
  const year = month.slice(0, 4);

  return doc.budgets.map((budget) => {
    const spentCents = doc.movements
      .filter(
        (m) =>
          m.type === "expense" &&
          m.categoryId === budget.categoryId &&
          accounts.get(m.accountId)?.currency === currency &&
          (budget.period === "monthly" ? monthOf(m.date) === month : m.date.slice(0, 4) === year)
      )
      .reduce((total, m) => total + cents(m.amount), 0);
    const limitCents = cents(budget.limit);
    const percent = limitCents === 0 ? 0 : (spentCents / limitCents) * 100;
    return {
      categoryId: budget.categoryId,
      name: categoryName.get(budget.categoryId) ?? UNCATEGORISED,
      period: budget.period,
      limit: budget.limit,
      spent: fromCents(spentCents),
      percent,
      status: percent > 100 ? "over" : percent >= 80 ? "close" : "under",
    };
  });
}
