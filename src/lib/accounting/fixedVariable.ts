/**
 * The floor under your month, and the part you can actually move.
 *
 * Rent leaves whether you act or not. Restaurants don't. A single "expenses"
 * figure hides which is which, so it can't answer the only question that
 * matters when money is tight: how much of this month is already decided?
 *
 * The classification lives on the category, so it's decided once rather than on
 * every transaction. The cost of that choice is real and worth naming: a
 * genuinely mixed category — a "Transport" that holds both a monthly pass and
 * the odd taxi — lands entirely on one side. Splitting it into two categories
 * is the fix, and the UI says so.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FlowInput {
  amount: number;
  categoryId: string | null;
  type: "income" | "expense" | "transfer" | "investment_contribution";
}

export interface CategoryFlag {
  id: string;
  fixed: boolean;
}

export interface FlowSplit {
  fixed: number;
  variable: number;
  /** Money in categories you haven't classified yet. */
  unclassified: number;
  total: number;
  /** Share of the total that is fixed, 0-100. Null when there's nothing. */
  fixedPercent: number | null;
}

function split(rows: FlowInput[], flags: Map<string, boolean>): FlowSplit {
  let fixed = 0;
  let variable = 0;
  let unclassified = 0;

  for (const r of rows) {
    const amount = Math.abs(r.amount);
    if (r.categoryId === null) {
      // No category means no answer. Guessing "variable" would flatter the
      // fixed figure and make the floor look lower than it is.
      unclassified += amount;
      continue;
    }
    const flag = flags.get(r.categoryId);
    if (flag === undefined) unclassified += amount;
    else if (flag) fixed += amount;
    else variable += amount;
  }

  const total = fixed + variable + unclassified;
  return {
    fixed: round2(fixed),
    variable: round2(variable),
    unclassified: round2(unclassified),
    total: round2(total),
    fixedPercent: total === 0 ? null : round2((fixed / total) * 100),
  };
}

export interface MonthFlows {
  income: FlowSplit;
  expenses: FlowSplit;
  /** Income that arrives whether you work or not, minus costs you can't avoid. */
  committedNet: number;
  /** What's left over once the fixed side is settled. */
  discretionary: number;
}

/**
 * Splits a month into what's decided and what isn't.
 *
 * `committedNet` is the honest floor: fixed income minus fixed costs. If it's
 * negative, the month needs variable income just to stand still, which is a
 * fact worth seeing on its own rather than buried inside a net figure.
 */
export function monthFlows(rows: FlowInput[], categories: CategoryFlag[]): MonthFlows {
  const flags = new Map(categories.map((c) => [c.id, c.fixed]));

  // Transfers move money between your own accounts and investment
  // contributions are savings, not spending. Neither belongs in a picture of
  // what the month costs.
  const relevant = rows.filter((r) => r.type === "income" || r.type === "expense");

  const income = split(
    relevant.filter((r) => r.type === "income"),
    flags
  );
  const expenses = split(
    relevant.filter((r) => r.type === "expense"),
    flags
  );

  return {
    income,
    expenses,
    committedNet: round2(income.fixed - expenses.fixed),
    discretionary: round2(income.total - expenses.total),
  };
}

/**
 * How many months the free cash covers the fixed costs.
 *
 * Deliberately measured against FIXED costs, not total spending. In a bad month
 * you stop eating out; you don't stop paying rent. A runway built on average
 * spending is optimistic exactly when it matters.
 */
export function fixedRunway(availableCash: number, monthlyFixedCosts: number): number | null {
  if (monthlyFixedCosts <= 0) return null;
  return round2(availableCash / monthlyFixedCosts);
}

/** Categories with money in them that haven't been classified yet. */
export function needsClassifying(
  rows: FlowInput[],
  categories: { id: string; name: string; fixed: boolean; touched: boolean }[]
): { id: string; name: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.categoryId) continue;
    totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + Math.abs(r.amount));
  }

  return categories
    .filter((c) => !c.touched && (totals.get(c.id) ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, amount: round2(totals.get(c.id) ?? 0) }))
    .sort((a, b) => b.amount - a.amount);
}
