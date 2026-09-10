import { describe, it, expect } from "vitest";
import {
  monthKey,
  shiftMonth,
  statusFor,
  buildBudgetLines,
  summarise,
  monthProgress,
  isPacingOver,
  type BudgetInput,
  type SpendInput,
} from "../budgets";

describe("month keys", () => {
  it("pads the month", () => {
    expect(monthKey(new Date(2026, 0, 15))).toBe("2026-01-01");
    expect(monthKey(new Date(2026, 11, 31))).toBe("2026-12-01");
  });

  it("steps across a year boundary in both directions", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("round-trips", () => {
    expect(shiftMonth(shiftMonth("2026-08-01", 5), -5)).toBe("2026-08-01");
  });
});

describe("statusFor", () => {
  it("flags overspend", () => {
    expect(statusFor(101, 100)).toBe("over");
  });

  it("warns before the limit is actually breached", () => {
    expect(statusFor(90, 100)).toBe("close");
    expect(statusFor(89.99, 100)).toBe("under");
  });

  it("treats exactly on the limit as not over", () => {
    // Spending your whole budget is doing it right, not failing.
    expect(statusFor(100, 100)).toBe("close");
  });

  it("has no opinion without a limit", () => {
    expect(statusFor(50, 0)).toBe("none");
  });
});

describe("buildBudgetLines", () => {
  const budgets: BudgetInput[] = [
    { categoryId: "food", categoryName: "Food", limit: 400 },
    { categoryId: "transport", categoryName: "Transportation", limit: 200 },
    { categoryId: "fun", categoryName: "Entertainment", limit: 150 },
  ];

  const spending: SpendInput[] = [
    { categoryId: "food", amount: -380 },
    { categoryId: "transport", amount: -50 },
    { categoryId: "fun", amount: -200 },
    { categoryId: null, amount: -75 },
  ];

  it("matches spending to limits", () => {
    const lines = buildBudgetLines(budgets, spending);
    const food = lines.find((l) => l.categoryId === "food")!;
    expect(food.spent).toBe(380);
    expect(food.remaining).toBe(20);
    expect(food.percent).toBe(95);
    expect(food.status).toBe("close");
  });

  it("takes the absolute value, so expense sign conventions don't matter", () => {
    const positive = buildBudgetLines(budgets, [{ categoryId: "food", amount: 380 }]);
    const negative = buildBudgetLines(budgets, [{ categoryId: "food", amount: -380 }]);
    expect(positive[0].spent).toBe(negative.find((l) => l.categoryId === "food")!.spent);
  });

  it("reports a negative remaining rather than clamping at zero", () => {
    const lines = buildBudgetLines(budgets, spending);
    const fun = lines.find((l) => l.categoryId === "fun")!;
    expect(fun.remaining).toBe(-50);
    expect(fun.status).toBe("over");
    expect(fun.percent).toBe(133);
  });

  it("never spreads uncategorised spending across budgets", () => {
    const lines = buildBudgetLines(budgets, spending);
    // The €75 with no category must not inflate any line.
    expect(lines.reduce((s, l) => s + l.spent, 0)).toBe(630);
  });

  it("sums several transactions in one category", () => {
    const lines = buildBudgetLines(
      [{ categoryId: "food", categoryName: "Food", limit: 100 }],
      [
        { categoryId: "food", amount: -10 },
        { categoryId: "food", amount: -20 },
        { categoryId: "food", amount: -30 },
      ]
    );
    expect(lines[0].spent).toBe(60);
  });

  it("shows an untouched budget as fully remaining", () => {
    const lines = buildBudgetLines([{ categoryId: "x", categoryName: "X", limit: 50 }], []);
    expect(lines[0]).toMatchObject({ spent: 0, remaining: 50, percent: 0, status: "under" });
  });

  it("puts the most consumed budget first", () => {
    const lines = buildBudgetLines(budgets, spending);
    expect(lines[0].categoryId).toBe("fun");
  });
});

describe("summarise", () => {
  const lines = buildBudgetLines(
    [
      { categoryId: "food", categoryName: "Food", limit: 400 },
      { categoryId: "fun", categoryName: "Entertainment", limit: 150 },
    ],
    [
      { categoryId: "food", amount: -380 },
      { categoryId: "fun", amount: -200 },
      { categoryId: "other", amount: -60 },
      { categoryId: null, amount: -75 },
    ]
  );

  const summary = summarise(
    lines,
    [
      { categoryId: "food", amount: -380 },
      { categoryId: "fun", amount: -200 },
      { categoryId: "other", amount: -60 },
      { categoryId: null, amount: -75 },
    ],
    new Set(["food", "fun"])
  );

  it("totals limits and spending", () => {
    expect(summary.totalLimit).toBe(550);
    expect(summary.totalSpent).toBe(580);
  });

  it("lets the remaining go negative", () => {
    expect(summary.remaining).toBe(-30);
  });

  it("counts breached budgets", () => {
    expect(summary.overCount).toBe(1);
  });

  it("separates spending with no category from spending with no budget", () => {
    // These are different problems: one needs categorising, the other needs a
    // limit. Merging them hides which action to take.
    expect(summary.uncategorised).toBe(75);
    expect(summary.unbudgeted).toBe(60);
  });
});

describe("monthProgress", () => {
  it("is 0 before the month and 1 after", () => {
    expect(monthProgress("2026-08-01", new Date(2026, 6, 15))).toBe(0);
    expect(monthProgress("2026-08-01", new Date(2026, 8, 15))).toBe(1);
  });

  it("is about half-way through a 31-day month on the 16th", () => {
    const p = monthProgress("2026-08-01", new Date(2026, 7, 16));
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });
});

describe("isPacingOver", () => {
  const line = { limit: 100, spent: 80 } as never as Parameters<typeof isPacingOver>[0];

  it("flags spending ahead of the calendar", () => {
    expect(isPacingOver(line, 0.4)).toBe(true);
  });

  it("is quiet when spending trails the calendar", () => {
    expect(isPacingOver(line, 0.9)).toBe(false);
  });

  it("says nothing at the very start of the month", () => {
    // On the 1st a single coffee is "1000% of pace" — technically true, useless.
    expect(isPacingOver(line, 0.01)).toBe(false);
  });

  it("says nothing at the very end, when it is too late to act", () => {
    expect(isPacingOver(line, 0.99)).toBe(false);
  });
});
