import { describe, it, expect } from "vitest";
import {
  byCategory,
  byMerchant,
  byMonth,
  byWeekday,
  fixedVsVariable,
  spendingTotals,
  isSpending,
  type SpendingRow,
} from "../analyse";
import {
  applySpendingFilters,
  spendingFilterOptions,
  describeSpendingFilters,
  presetRange,
  NO_SPENDING_FILTERS,
} from "../filter";

const row = (over: Partial<SpendingRow> = {}): SpendingRow => ({
  date: "2026-03-02T10:00:00.000Z",
  type: "expense",
  amount: -50,
  categoryName: "Food",
  subcategoryName: "Groceries",
  accountName: "Millennium",
  merchant: "Pingo Doce",
  fixed: false,
  ...over,
});

const MONTH: SpendingRow[] = [
  row({ date: "2026-03-02T10:00:00.000Z", amount: -50, merchant: "Pingo Doce" }),
  row({ date: "2026-03-05T10:00:00.000Z", amount: -30, merchant: "Pingo Doce" }),
  row({
    date: "2026-03-01T10:00:00.000Z",
    amount: -600,
    categoryName: "Rent",
    subcategoryName: null,
    merchant: "Landlord",
    fixed: true,
  }),
  row({
    date: "2026-03-10T10:00:00.000Z",
    amount: -20,
    categoryName: null,
    subcategoryName: null,
    merchant: null,
  }),
  row({
    date: "2026-03-25T10:00:00.000Z",
    type: "income",
    amount: 2000,
    categoryName: "Salary",
    merchant: null,
  }),
  // A transfer between your own accounts is not spending and must not count.
  // No merchant and no category, because there is nobody being paid.
  row({
    date: "2026-03-26T10:00:00.000Z",
    type: "transfer",
    amount: -500,
    categoryName: null,
    subcategoryName: null,
    merchant: null,
  }),
];

describe("where the money goes", () => {
  it("groups spending by category, biggest first", () => {
    const groups = byCategory(MONTH);
    expect(groups.map((g) => g.name)).toEqual(["Rent", "Food", "Uncategorised"]);
    expect(groups[0].spent).toBe(600);
    expect(groups[1].spent).toBe(80);
  });

  /**
   * Named, never dropped. A pile of spending with no category is the most
   * useful thing this page can point at, and leaving it out would make the
   * shares add up while describing less money than was spent.
   */
  it("names uncategorised spending rather than hiding it", () => {
    const uncategorised = byCategory(MONTH).find((g) => g.name === "Uncategorised");
    expect(uncategorised?.spent).toBe(20);
  });

  it("shares add to a hundred", () => {
    const total = byCategory(MONTH).reduce((s, g) => s + g.share, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  /**
   * Transfers are money moving between your own pockets. Counting one would
   * make the month look €500 more expensive than it was.
   */
  it("excludes transfers, which are not spending", () => {
    expect(byCategory(MONTH).reduce((s, g) => s + g.spent, 0)).toBe(700);
    expect(MONTH.filter(isSpending)).toHaveLength(4);
  });

  it("groups by who was paid, which is often the actionable one", () => {
    const merchants = byMerchant(MONTH);
    expect(merchants[0]).toMatchObject({ name: "Landlord", spent: 600, count: 1 });
    expect(merchants.find((m) => m.name === "Pingo Doce")).toMatchObject({ spent: 80, count: 2 });
  });

  it("reports the largest single transaction in a group", () => {
    expect(byMerchant(MONTH).find((m) => m.name === "Pingo Doce")?.largest).toBe(50);
  });

  it("has nothing to group when nothing was spent", () => {
    expect(byCategory([])).toEqual([]);
    expect(byCategory([row({ type: "income", amount: 100 })])).toEqual([]);
  });
});

describe("month by month", () => {
  it("puts income and spending side by side", () => {
    const [march] = byMonth(MONTH);
    expect(march.month).toBe("2026-03");
    expect(march.income).toBe(2000);
    expect(march.spent).toBe(700);
    expect(march.net).toBe(1300);
  });

  /**
   * A month nobody recorded is not a month of no spending. Filling the gap
   * with a zero draws a line to the floor and reads as the opposite.
   */
  it("skips a month with nothing in it rather than drawing a zero", () => {
    const across = byMonth([
      row({ date: "2026-01-05T10:00:00.000Z", amount: -10 }),
      row({ date: "2026-03-05T10:00:00.000Z", amount: -10 }),
    ]);
    expect(across.map((m) => m.month)).toEqual(["2026-01", "2026-03"]);
  });

  it("sorts oldest first, so a chart reads left to right", () => {
    const across = byMonth([
      row({ date: "2026-05-05T10:00:00.000Z", amount: -10 }),
      row({ date: "2026-02-05T10:00:00.000Z", amount: -10 }),
    ]);
    expect(across.map((m) => m.month)).toEqual(["2026-02", "2026-05"]);
  });
});

describe("which day of the week", () => {
  it("always returns seven days, so the chart has a fixed shape", () => {
    const days = byWeekday(MONTH);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("leads with Monday, the way a week is written here", () => {
    // 2026-03-01 is a Sunday; 2026-03-02 a Monday.
    const days = byWeekday([row({ date: "2026-03-02T10:00:00.000Z", amount: -10 })]);
    expect(days[0].label).toBe("Mon");
    expect(days[0].spent).toBe(10);
  });

  /**
   * Read in UTC like every date in this codebase, so a late purchase does not
   * land on the following day for anyone east of Greenwich.
   */
  it("keeps a late-evening purchase on its own day", () => {
    const days = byWeekday([row({ date: "2026-03-02T23:30:00.000Z", amount: -10 })]);
    expect(days[0].spent).toBe(10);
    expect(days[1].spent).toBe(0);
  });
});

describe("committed against chosen", () => {
  it("splits fixed costs from the rest", () => {
    const split = fixedVsVariable(MONTH);
    expect(split.fixed).toBe(600);
    expect(split.variable).toBe(100);
    expect(split.fixedShare).toBeCloseTo(85.71, 1);
  });

  /**
   * Null, not zero. No spending means the question has no answer, and 0% would
   * claim nothing was committed — a measurement nobody made.
   */
  it("has no share to report when nothing was spent", () => {
    expect(fixedVsVariable([]).fixedShare).toBeNull();
    expect(fixedVsVariable([]).fixed).toBe(0);
  });
});

describe("the totals above the charts", () => {
  it("adds income and spending without letting transfers in", () => {
    const t = spendingTotals(MONTH);
    expect(t.income).toBe(2000);
    expect(t.spent).toBe(700);
    expect(t.net).toBe(1300);
  });

  it("names the biggest single thing paid for", () => {
    expect(spendingTotals(MONTH).largest).toEqual({ name: "Landlord", amount: 600 });
  });

  it("says how much spending has no category, which is what to fix first", () => {
    expect(spendingTotals(MONTH).uncategorised).toBe(20);
  });

  /** Null, not a zero-amount placeholder, when nothing was spent at all. */
  it("has no largest when nothing was spent", () => {
    expect(spendingTotals([row({ type: "income", amount: 100 })]).largest).toBeNull();
  });
});

describe("narrowing, and every figure following", () => {
  it("filters by category and the totals follow", () => {
    const food = applySpendingFilters(MONTH, { ...NO_SPENDING_FILTERS, categoryName: "Food" });
    expect(food).toHaveLength(2);
    expect(spendingTotals(food).spent).toBe(80);
    expect(byCategory(food).map((g) => g.name)).toEqual(["Food"]);
    // The share is of what is left, so one category alone is all of it.
    expect(byCategory(food)[0].share).toBe(100);
  });

  it("filters by merchant, account and committed", () => {
    expect(
      applySpendingFilters(MONTH, { ...NO_SPENDING_FILTERS, merchant: "Pingo Doce" })
    ).toHaveLength(2);
    expect(
      applySpendingFilters(MONTH, { ...NO_SPENDING_FILTERS, accountName: "Millennium" })
    ).toHaveLength(6);
    expect(applySpendingFilters(MONTH, { ...NO_SPENDING_FILTERS, committed: "fixed" })).toHaveLength(
      1
    );
  });

  it("filters by a date range, both ends inclusive", () => {
    const rows = applySpendingFilters(MONTH, {
      ...NO_SPENDING_FILTERS,
      from: "2026-03-02",
      to: "2026-03-05",
    });
    expect(rows).toHaveLength(2);
  });

  it("offers only values present in the data", () => {
    const o = spendingFilterOptions(MONTH);
    expect(o.categories).toEqual(["Food", "Rent", "Salary"]);
    expect(o.merchants).toEqual(["Landlord", "Pingo Doce"]);
    expect(o.earliest).toBe("2026-03-01");
    expect(o.latest).toBe("2026-03-26");
    expect(o.hasFixed).toBe(true);
    expect(o.hasVariable).toBe(true);
  });

  it("never offers an option that empties the screen", () => {
    const o = spendingFilterOptions(MONTH);
    for (const categoryName of o.categories) {
      expect(
        applySpendingFilters(MONTH, { ...NO_SPENDING_FILTERS, categoryName }).length
      ).toBeGreaterThan(0);
    }
    for (const merchant of o.merchants) {
      expect(
        applySpendingFilters(MONTH, { ...NO_SPENDING_FILTERS, merchant }).length
      ).toBeGreaterThan(0);
    }
  });

  it("says what it is showing", () => {
    expect(describeSpendingFilters(NO_SPENDING_FILTERS)).toBeNull();
    expect(
      describeSpendingFilters({ ...NO_SPENDING_FILTERS, categoryName: "Food", merchant: "Pingo Doce" })
    ).toBe("Food · at Pingo Doce");
  });
});

/**
 * The ranges people actually ask for. Typing two dates to ask "how was last
 * month" is friction that makes a page go unused.
 */
describe("ready-made ranges", () => {
  const march = new Date(Date.UTC(2026, 2, 15));

  it("gives the last whole month", () => {
    expect(presetRange("last-month", march)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("ends the current ranges on the last day of this month", () => {
    expect(presetRange("last-3-months", march)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(presetRange("this-year", march)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("spans twelve months including this one", () => {
    expect(presetRange("last-12-months", march)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });

  /**
   * Built with Date.UTC on both sides, so a month boundary is a month boundary
   * whatever the clock has done — the same arithmetic `calendarDaysBetween`
   * needs, and for the same reason.
   */
  it("gets February right in a leap year", () => {
    expect(presetRange("last-month", new Date(Date.UTC(2028, 2, 10)))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });
});
