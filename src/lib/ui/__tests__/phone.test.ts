import { describe, expect, it } from "vitest";
import { changeFromLastMonth, dayKey, greetingFor, monthBudgetLine, monthlySpending } from "../phoneSummary";
import { accountIcon, categoryIcon, PHONE_ICONS } from "../phoneIcons";

const budget = (over: Partial<Parameters<typeof monthBudgetLine>[0][number]> = {}) => ({
  period: "monthly", available: 100, spent: 40, remaining: 60,
  bounds: { start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) }, ...over,
});

describe("phone summaries (F30)", () => {
  it("greets by the hour on the device", () => {
    expect(greetingFor(7)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good afternoon");
    expect(greetingFor(19)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });

  it("adds the month's budgets, counting only what is still under as free", () => {
    const line = monthBudgetLine([budget(), budget({ available: 50, spent: 80, remaining: -30 })], new Date(2026, 10, 26, 15));
    expect(line).toEqual({ spent: 120, available: 150, left: 60, daysLeft: 5, percent: 80, over: false });
  });

  it("leaves weekly budgets out of the month and says nothing without a monthly one", () => {
    expect(monthBudgetLine([budget({ period: "weekly" })], new Date(2026, 10, 26))).toBeNull();
    const line = monthBudgetLine([budget(), budget({ period: "weekly", spent: 999 })], new Date(2026, 10, 30));
    expect(line?.spent).toBe(40);
    expect(line?.daysLeft).toBe(1);
  });

  it("marks a month spent past its budgets", () => {
    const line = monthBudgetLine([budget({ spent: 130, remaining: -30 })], new Date(2026, 10, 10));
    expect(line).toMatchObject({ left: 0, percent: 100, over: true });
  });

  it("sums expenses per calendar month, oldest first, ignoring transfers and income", () => {
    const today = new Date(2026, 10, 26);
    const series = monthlySpending([
      { date: new Date(2026, 10, 3), amount: -40, type: "expense" },
      { date: new Date(2026, 10, 20), amount: -10.5, type: "expense" },
      { date: new Date(2026, 9, 31, 23), amount: -5, type: "expense" },
      { date: new Date(2026, 10, 4), amount: -200, type: "transfer" },
      { date: new Date(2026, 10, 4), amount: 900, type: "income" },
      { date: new Date(2026, 3, 1), amount: -70, type: "expense" },
    ], today, 6);
    expect(series.map(m => m.start.getMonth())).toEqual([5, 6, 7, 8, 9, 10]);
    expect(series.map(m => m.total)).toEqual([0, 0, 0, 0, 5, 50.5]);
  });

  it("compares this month with the last only when there is one to compare", () => {
    expect(changeFromLastMonth([{ total: 200 }, { total: 150 }])).toBe(-25);
    expect(changeFromLastMonth([{ total: 0 }, { total: 150 }])).toBeNull();
    expect(changeFromLastMonth([{ total: 10 }])).toBeNull();
  });

  it("keys a day in local time", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("phone icons (F30)", () => {
  it("recognises common category names in English and Portuguese, accents or not", () => {
    expect(categoryIcon("Supermercado")).toBe("groceries");
    expect(categoryIcon("Groceries")).toBe("groceries");
    expect(categoryIcon("Restaurantes")).toBe("dining");
    expect(categoryIcon("Saúde")).toBe("health");
    expect(categoryIcon("saude")).toBe("health");
    expect(categoryIcon("Salário", "income")).toBe("salary");
    expect(categoryIcon("Rent")).toBe("home");
  });

  it("falls back to a plain picture rather than a wrong guess", () => {
    expect(categoryIcon("Xyz")).toBe("tag");
    expect(categoryIcon(null, "income")).toBe("in");
    expect(categoryIcon("Groceries", "transfer")).toBe("transfer");
  });

  it("draws an account from its type, and a card when it is in debt", () => {
    expect(accountIcon("bank")).toBe("bank");
    expect(accountIcon("cash")).toBe("cash");
    expect(accountIcon("bank", -10)).toBe("card");
    expect(accountIcon("other")).toBe("wallet");
  });

  it("has a path for every icon name", () => {
    for (const [name, path] of Object.entries(PHONE_ICONS)) expect(path.startsWith("M"), name).toBe(true);
  });
});
