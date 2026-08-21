import { describe, it, expect } from "vitest";
import { monthFlows, fixedRunway, needsClassifying, type FlowInput } from "../fixedVariable";

const categories = [
  { id: "rent", fixed: true },
  { id: "salary", fixed: true },
  { id: "food", fixed: false },
  { id: "freelance", fixed: false },
];

const rows: FlowInput[] = [
  { amount: 2000, categoryId: "salary", type: "income" },
  { amount: 500, categoryId: "freelance", type: "income" },
  { amount: -800, categoryId: "rent", type: "expense" },
  { amount: -400, categoryId: "food", type: "expense" },
];

describe("monthFlows", () => {
  it("splits income and expenses by whether they're decided", () => {
    const f = monthFlows(rows, categories);
    expect(f.income.fixed).toBe(2000);
    expect(f.income.variable).toBe(500);
    expect(f.expenses.fixed).toBe(800);
    expect(f.expenses.variable).toBe(400);
  });

  it("reports the floor: fixed income minus fixed costs", () => {
    expect(monthFlows(rows, categories).committedNet).toBe(1200);
  });

  it("shows a negative floor rather than hiding it in the net", () => {
    // Fixed costs exceed fixed income: the month needs variable work just to
    // stand still, even though the overall net is positive.
    const tight: FlowInput[] = [
      { amount: 500, categoryId: "salary", type: "income" },
      { amount: 2000, categoryId: "freelance", type: "income" },
      { amount: -900, categoryId: "rent", type: "expense" },
    ];
    const f = monthFlows(tight, categories);
    expect(f.committedNet).toBe(-400);
    expect(f.discretionary).toBe(1600);
  });

  it("takes the absolute value, so expense signs don't matter", () => {
    const positive = monthFlows([{ amount: 800, categoryId: "rent", type: "expense" }], categories);
    const negative = monthFlows([{ amount: -800, categoryId: "rent", type: "expense" }], categories);
    expect(positive.expenses.fixed).toBe(negative.expenses.fixed);
  });

  it("never guesses for an uncategorised movement", () => {
    // Assuming "variable" would flatter the floor and make it look lower.
    const f = monthFlows([{ amount: -300, categoryId: null, type: "expense" }], categories);
    expect(f.expenses.unclassified).toBe(300);
    expect(f.expenses.fixed).toBe(0);
    expect(f.expenses.variable).toBe(0);
  });

  it("treats a category it doesn't know as unclassified", () => {
    const f = monthFlows([{ amount: -300, categoryId: "ghost", type: "expense" }], categories);
    expect(f.expenses.unclassified).toBe(300);
  });

  it("ignores transfers between your own accounts", () => {
    // Moving money is not spending it.
    const f = monthFlows(
      [...rows, { amount: -5000, categoryId: null, type: "transfer" }],
      categories
    );
    expect(f.expenses.total).toBe(1200);
  });

  it("ignores investment contributions", () => {
    // Saving is not a cost, however much it feels like one.
    const f = monthFlows(
      [...rows, { amount: -50, categoryId: null, type: "investment_contribution" }],
      categories
    );
    expect(f.expenses.total).toBe(1200);
  });

  it("reports what share of spending is already decided", () => {
    expect(monthFlows(rows, categories).expenses.fixedPercent).toBe(66.67);
  });

  it("has no percentage for an empty month", () => {
    const f = monthFlows([], categories);
    expect(f.expenses.fixedPercent).toBeNull();
    expect(f.committedNet).toBe(0);
  });
});

describe("fixedRunway", () => {
  it("measures cash against fixed costs, not all spending", () => {
    // In a bad month you stop eating out; you don't stop paying rent.
    expect(fixedRunway(8000, 800)).toBe(10);
  });

  it("is null when there are no fixed costs to survive", () => {
    expect(fixedRunway(8000, 0)).toBeNull();
  });
});

describe("needsClassifying", () => {
  it("lists categories with money that were never classified", () => {
    const out = needsClassifying(rows, [
      { id: "rent", name: "Rent", fixed: true, touched: true },
      { id: "food", name: "Food", fixed: false, touched: false },
      { id: "salary", name: "Salary", fixed: true, touched: false },
    ]);
    expect(out.map((c) => c.id)).toEqual(["salary", "food"]);
  });

  it("puts the biggest first, so the useful one is on top", () => {
    const out = needsClassifying(rows, [
      { id: "food", name: "Food", fixed: false, touched: false },
      { id: "salary", name: "Salary", fixed: true, touched: false },
    ]);
    expect(out[0].amount).toBe(2000);
  });

  it("ignores a category with no money in it", () => {
    const out = needsClassifying(rows, [
      { id: "empty", name: "Empty", fixed: false, touched: false },
    ]);
    expect(out).toEqual([]);
  });
});
