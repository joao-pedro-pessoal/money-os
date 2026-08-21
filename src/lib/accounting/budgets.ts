/**
 * Monthly spending limits per expense category.
 *
 * A budget is NOT a bucket, and the difference has to stay sharp or the app
 * grows a sixth double-counting bug:
 *
 *   bucket  — money physically set aside inside an account. It exists. It is
 *             part of Net Worth. Moving it changes what's free to spend.
 *   budget  — an intention about spending. It moves nothing, holds nothing,
 *             and appears in no total. Blowing through it costs you nothing
 *             except the information that you blew through it.
 *
 * Nothing in this file touches a balance.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Month key as YYYY-MM-01, the format stored in `budgets.month`. */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

/** Steps a month key by `delta` months, for the previous/next buttons. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export interface BudgetInput {
  categoryId: string;
  categoryName: string;
  limit: number;
}

export interface SpendInput {
  categoryId: string | null;
  /** Positive number of money spent. */
  amount: number;
}

export type BudgetStatus = "under" | "close" | "over" | "none";

export interface BudgetLine {
  categoryId: string;
  categoryName: string;
  limit: number;
  spent: number;
  remaining: number;
  /** 0-100+, uncapped so going over is visible as a number. */
  percent: number;
  status: BudgetStatus;
}

/** Within this share of the limit, warn before it's actually breached. */
const CLOSE_THRESHOLD = 0.9;

export function statusFor(spent: number, limit: number): BudgetStatus {
  if (limit <= 0) return "none";
  if (spent > limit) return "over";
  if (spent >= limit * CLOSE_THRESHOLD) return "close";
  return "under";
}

/**
 * Joins limits to what was actually spent in the month.
 *
 * Spending with no category is deliberately not spread across budgets: it lands
 * in `uncategorised` so an unassigned €300 is visible as a gap in the picture
 * rather than quietly making every budget look healthy.
 */
export function buildBudgetLines(budgets: BudgetInput[], spending: SpendInput[]): BudgetLine[] {
  const spentByCategory = new Map<string, number>();
  for (const s of spending) {
    if (!s.categoryId) continue;
    spentByCategory.set(s.categoryId, (spentByCategory.get(s.categoryId) ?? 0) + Math.abs(s.amount));
  }

  return budgets
    .map((b) => {
      const spent = round2(spentByCategory.get(b.categoryId) ?? 0);
      const limit = round2(b.limit);
      return {
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        limit,
        spent,
        remaining: round2(limit - spent),
        percent: limit > 0 ? Math.round((spent / limit) * 100) : 0,
        status: statusFor(spent, limit),
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

export interface BudgetSummary {
  totalLimit: number;
  totalSpent: number;
  remaining: number;
  overCount: number;
  /** Spending in the month that belongs to no budgeted category. */
  uncategorised: number;
  /** Spending on categories that exist but have no limit set. */
  unbudgeted: number;
}

export function summarise(
  lines: BudgetLine[],
  spending: SpendInput[],
  allBudgetedCategoryIds: Set<string>
): BudgetSummary {
  const totalLimit = round2(lines.reduce((s, l) => s + l.limit, 0));
  const totalSpent = round2(lines.reduce((s, l) => s + l.spent, 0));

  let uncategorised = 0;
  let unbudgeted = 0;
  for (const s of spending) {
    if (!s.categoryId) uncategorised += Math.abs(s.amount);
    else if (!allBudgetedCategoryIds.has(s.categoryId)) unbudgeted += Math.abs(s.amount);
  }

  return {
    totalLimit,
    totalSpent,
    // Can go negative, and should: an overspent month is not "0 left".
    remaining: round2(totalLimit - totalSpent),
    overCount: lines.filter((l) => l.status === "over").length,
    uncategorised: round2(uncategorised),
    unbudgeted: round2(unbudgeted),
  };
}

/**
 * How far through the month we are, 0-1.
 *
 * Used to say "you're 40% through the month and 80% through the budget", which
 * is the part that makes a budget actionable instead of a post-mortem.
 */
export function monthProgress(key: string, today: Date): number {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  if (today <= start) return 0;
  if (today >= end) return 1;
  return (today.getTime() - start.getTime()) / (end.getTime() - start.getTime());
}

/**
 * True when spending is running ahead of the calendar.
 *
 * Only meaningful mid-month: on the 1st everything looks fine and on the 31st
 * it's too late to matter.
 */
export function isPacingOver(line: BudgetLine, progress: number): boolean {
  if (line.limit <= 0 || progress <= 0.05 || progress >= 0.95) return false;
  return line.spent / line.limit > progress;
}
