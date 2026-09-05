import { describe, it, expect } from "vitest";
import {
  applyTransactionFilters,
  transactionFilterOptions,
  hasActiveTransactionFilters,
  transactionTotals,
  directionOf,
  NO_TRANSACTION_FILTERS,
  type TransactionRow,
} from "../transactionFilter";

const tx = (over: Partial<TransactionRow> & { id: string }): TransactionRow => ({
  date: "2026-09-03T00:00:00.000Z",
  type: "expense",
  amount: -10,
  currency: "EUR",
  accountName: "Rvoult",
  categoryName: "Food",
  description: null,
  merchant: null,
  ...over,
});

/** The rows on the screen this was built for. */
const ROWS = [
  tx({ id: "1", date: "2026-09-03T00:00:00.000Z", type: "income", amount: 200, categoryName: "Sale" }),
  tx({ id: "2", date: "2026-09-03T00:00:00.000Z", amount: -300, categoryName: "Food" }),
  tx({ id: "3", date: "2026-09-02T00:00:00.000Z", type: "income", amount: 225, categoryName: "Freelance" }),
  tx({
    id: "4",
    date: "2026-09-01T00:00:00.000Z",
    type: "income",
    amount: 100,
    categoryName: "Travel",
    accountName: "Interactive Brokers",
  }),
  tx({ id: "5", date: "2026-08-31T00:00:00.000Z", amount: -12, categoryName: "Health" }),
];

describe("which way the money went", () => {
  it("reads the sign, not the label", () => {
    expect(directionOf(tx({ id: "a", amount: 5 }))).toBe("in");
    expect(directionOf(tx({ id: "a", amount: -5 }))).toBe("out");
  });

  /**
   * `investment_contribution` is money leaving to be invested: its type says
   * one thing and its direction another. The sign is the direction, and reading
   * the label would put it on the wrong side of a list whose job is showing
   * which way money went.
   */
  it("puts an investment contribution on the way out", () => {
    const contribution = tx({ id: "a", type: "investment_contribution", amount: -500 });
    expect(directionOf(contribution)).toBe("out");
  });
});

describe("narrowing the list", () => {
  it("lets everything through when nothing is set", () => {
    expect(applyTransactionFilters(ROWS, NO_TRANSACTION_FILTERS)).toHaveLength(5);
  });

  it("filters by direction", () => {
    const income = applyTransactionFilters(ROWS, { ...NO_TRANSACTION_FILTERS, direction: "in" });
    expect(income.map((r) => r.id)).toEqual(["1", "3", "4"]);
  });

  it("filters by account", () => {
    const ibkr = applyTransactionFilters(ROWS, {
      ...NO_TRANSACTION_FILTERS,
      accountName: "Interactive Brokers",
    });
    expect(ibkr.map((r) => r.id)).toEqual(["4"]);
  });

  it("filters by category", () => {
    const food = applyTransactionFilters(ROWS, { ...NO_TRANSACTION_FILTERS, categoryName: "Food" });
    expect(food.map((r) => r.id)).toEqual(["2"]);
  });

  it("filters by type, which is narrower than direction", () => {
    const rows = [...ROWS, tx({ id: "6", type: "investment_contribution", amount: -50 })];
    const out = applyTransactionFilters(rows, { ...NO_TRANSACTION_FILTERS, direction: "out" });
    const contributions = applyTransactionFilters(rows, {
      ...NO_TRANSACTION_FILTERS,
      type: "investment_contribution",
    });
    expect(out.map((r) => r.id)).toEqual(["2", "5", "6"]);
    expect(contributions.map((r) => r.id)).toEqual(["6"]);
  });

  /**
   * ISO day strings, which sort correctly and carry no timezone. Comparing
   * `Date` objects would put an evening transaction on the wrong side of a
   * boundary for anyone not on UTC — seasonally, and so invisibly in testing.
   */
  it("filters by a date range, inclusive at both ends", () => {
    const range = applyTransactionFilters(ROWS, {
      ...NO_TRANSACTION_FILTERS,
      from: "2026-09-01",
      to: "2026-09-02",
    });
    expect(range.map((r) => r.id)).toEqual(["3", "4"]);
  });

  it("searches the description and the merchant together", () => {
    const rows = [
      tx({ id: "a", description: "Pingo Doce" }),
      tx({ id: "b", merchant: "Continente" }),
      tx({ id: "c" }),
    ];
    expect(
      applyTransactionFilters(rows, { ...NO_TRANSACTION_FILTERS, search: "pingo" }).map((r) => r.id)
    ).toEqual(["a"]);
    expect(
      applyTransactionFilters(rows, { ...NO_TRANSACTION_FILTERS, search: "contin" }).map((r) => r.id)
    ).toEqual(["b"]);
  });

  it("combines filters rather than replacing one with another", () => {
    const both = applyTransactionFilters(ROWS, {
      ...NO_TRANSACTION_FILTERS,
      direction: "in",
      accountName: "Rvoult",
    });
    expect(both.map((r) => r.id)).toEqual(["1", "3"]);
  });
});

describe("what the controls offer", () => {
  /**
   * Only values that occur. A category nothing was filed under is a control
   * that always returns nothing, which reads as the filter being broken.
   */
  it("lists only what the rows actually carry, sorted", () => {
    const options = transactionFilterOptions(ROWS);
    expect(options.accounts).toEqual(["Interactive Brokers", "Rvoult"]);
    expect(options.categories).toEqual(["Food", "Freelance", "Health", "Sale", "Travel"]);
    expect(options.types).toEqual(["expense", "income"]);
  });

  it("skips a row with no account or category rather than offering a blank", () => {
    const options = transactionFilterOptions([tx({ id: "a", accountName: null, categoryName: null })]);
    expect(options.accounts).toEqual([]);
    expect(options.categories).toEqual([]);
  });
});

describe("knowing whether anything is set", () => {
  it("is false for the empty filters", () => {
    expect(hasActiveTransactionFilters(NO_TRANSACTION_FILTERS)).toBe(false);
  });

  it("does not count whitespace as a search", () => {
    expect(
      hasActiveTransactionFilters({ ...NO_TRANSACTION_FILTERS, search: "   " })
    ).toBe(false);
  });

  it("is true for any one of them", () => {
    expect(hasActiveTransactionFilters({ ...NO_TRANSACTION_FILTERS, direction: "in" })).toBe(true);
    expect(hasActiveTransactionFilters({ ...NO_TRANSACTION_FILTERS, from: "2026-01-01" })).toBe(true);
  });
});

describe("what the visible slice adds up to", () => {
  /**
   * In and out are kept apart. A month with 3 000 in and 2 900 out is not the
   * same as one with 100 in and nothing out, and a single net figure renders
   * them identically.
   */
  it("totals each direction separately", () => {
    expect(transactionTotals(ROWS)).toEqual({
      inflow: 525,
      outflow: 312,
      net: 213,
      count: 5,
    });
  });

  /** The sign lives in the label above the number, not in the number. */
  it("reports what went out as a positive figure", () => {
    expect(transactionTotals([tx({ id: "a", amount: -40 })]).outflow).toBe(40);
  });

  it("recomputes over whatever is left, which is the point", () => {
    const income = applyTransactionFilters(ROWS, { ...NO_TRANSACTION_FILTERS, direction: "in" });
    expect(transactionTotals(income)).toEqual({ inflow: 525, outflow: 0, net: 525, count: 3 });
  });

  it("has nothing to say about nothing", () => {
    expect(transactionTotals([])).toEqual({ inflow: 0, outflow: 0, net: 0, count: 0 });
  });
});
