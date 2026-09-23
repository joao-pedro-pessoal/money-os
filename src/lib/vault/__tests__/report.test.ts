import { describe, expect, it } from "vitest";
import { addAccount, addCategory, addMovement, addTransfer, emptyDocument, type VaultDocument } from "../document";
import { budgetLines, incomeByCategory, monthReport, monthsWithMovements, UNCATEGORISED } from "../report";

function vault(): VaultDocument {
  let doc = emptyDocument("EUR");
  doc = addAccount(doc, { id: "a", name: "Current", kind: "bank", currency: "EUR", balance: "1000.00", createdAt: "2026-01-01" });
  doc = addAccount(doc, { id: "s", name: "Savings", kind: "bank", currency: "EUR", balance: "0.00", createdAt: "2026-01-01" });
  doc = addAccount(doc, { id: "u", name: "Dollars", kind: "bank", currency: "USD", balance: "500.00", createdAt: "2026-01-01" });
  doc = addCategory(doc, { id: "food", name: "Food", kind: "expense" });
  doc = addCategory(doc, { id: "rent", name: "Rent", kind: "expense" });
  doc = addCategory(doc, { id: "pay", name: "Salary", kind: "income" });

  const expense = (id: string, amount: string, categoryId: string | null, date = "2026-09-10") => ({
    id,
    accountId: "a",
    type: "expense" as const,
    amount,
    currency: "EUR",
    date,
    categoryId,
    merchant: null,
    description: "",
    transferId: null,
    transferOut: null,
  });

  doc = addMovement(doc, expense("e1", "60.00", "food"));
  doc = addMovement(doc, expense("e2", "40.00", "food", "2026-09-15"));
  doc = addMovement(doc, expense("e3", "500.00", "rent"));
  doc = addMovement(doc, expense("e4", "100.00", null));
  doc = addMovement(doc, expense("e5", "999.00", "food", "2026-08-10"));
  doc = addMovement(doc, { ...expense("i1", "1500.00", "pay"), type: "income", categoryId: "pay" });
  doc = addMovement(doc, { ...expense("u1", "80.00", null), accountId: "u", currency: "USD" });
  doc = addTransfer(doc, { fromId: "a", toId: "s", amount: "200.00", date: "2026-09-20", outId: "t-out", inId: "t-in" });
  return doc;
}

describe("a month in a vault", () => {
  const report = monthReport(vault(), "2026-09");

  it("adds up what came in and what went out, and what is left", () => {
    expect(report.income).toBe("1500.00");
    expect(report.spent).toBe("700.00");
    expect(report.net).toBe("800.00");
  });

  it("splits the spending by category, largest first", () => {
    expect(report.byCategory.map((c) => [c.name, c.amount])).toEqual([
      ["Rent", "500.00"],
      ["Food", "100.00"],
      [UNCATEGORISED, "100.00"],
    ]);
    expect(report.byCategory[0].percent).toBeCloseTo((500 / 700) * 100);
    expect(report.byCategory[1].movements).toBe(2);
  });

  it("never counts a transfer as spending, but says how much moved", () => {
    expect(report.transferred).toBe("200.00");
    expect(report.byCategory.some((c) => c.name.includes("→"))).toBe(false);
  });

  it("leaves another currency out and names it", () => {
    expect(report.leftOut).toEqual(["USD"]);
    expect(monthReport(vault(), "2026-09", "USD").spent).toBe("80.00");
  });

  it("keeps the parts adding up to the total", () => {
    const parts = report.byCategory.reduce((sum, c) => sum + Number(c.amount), 0);
    expect(parts.toFixed(2)).toBe(report.spent);
  });

  it("offers the months that have something in them, newest first", () => {
    expect(monthsWithMovements(vault())).toEqual(["2026-09", "2026-08"]);
  });

  it("shows income by category too", () => {
    expect(incomeByCategory(vault(), "2026-09")).toEqual([
      { name: "Salary", amount: "1500.00", percent: 100, movements: 1 },
    ]);
  });
});

describe("budgets in a vault", () => {
  it("compares a monthly budget with the month, and a yearly one with the year", () => {
    let doc = vault();
    doc = { ...doc, budgets: [
      { id: "b1", categoryId: "food", limit: "120.00", period: "monthly" },
      { id: "b2", categoryId: "food", limit: "2000.00", period: "yearly" },
    ] };
    const [monthly, yearly] = budgetLines(doc, "2026-09");
    expect(monthly).toMatchObject({ name: "Food", spent: "100.00", status: "close" });
    expect(monthly.percent).toBeCloseTo((100 / 120) * 100);
    // The year includes August's 999, which the month does not.
    expect(yearly.spent).toBe("1099.00");
    expect(yearly.status).toBe("under");
  });

  it("calls it over only past the limit", () => {
    let doc = vault();
    doc = { ...doc, budgets: [{ id: "b", categoryId: "rent", limit: "450.00", period: "monthly" }] };
    expect(budgetLines(doc, "2026-09")[0].status).toBe("over");
  });
});
