import { describe, expect, it } from "vitest";
import { documentFromSite, type SiteAccount, type SiteTransaction } from "../import";
import { monthReport } from "../report";
import { totalIn } from "../document";

const account = (over: Partial<SiteAccount> = {}): SiteAccount => ({
  id: "a",
  name: "Current",
  accountType: "bank",
  currency: "EUR",
  balance: "1000.00",
  active: true,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  ...over,
});

const transaction = (over: Partial<SiteTransaction> = {}): SiteTransaction => ({
  id: "t1",
  accountId: "a",
  type: "expense",
  amount: "-25.50",
  currency: "EUR",
  date: new Date("2026-09-10T12:00:00Z"),
  categoryId: "food",
  merchant: "Pingo Doce",
  description: "Groceries",
  ...over,
});

const base = {
  baseCurrency: "EUR",
  accounts: [account(), account({ id: "s", name: "Savings", balance: "500.00" })],
  categories: [
    { id: "food", name: "Food", kind: "expense" },
    { id: "pay", name: "Salary", kind: "income" },
    { id: "gone", name: "Nothing", kind: "other" },
  ],
  transactions: [transaction()],
  transfers: [],
  budgets: [],
};

describe("bringing the site's records into a vault", () => {
  it("carries accounts with the balance the site states, and the movements as history", () => {
    const { document } = documentFromSite(base);
    expect(document.accounts[0]).toMatchObject({ name: "Current", kind: "bank", balance: "1000.00", createdAt: "2026-01-01" });
    expect(totalIn(document, "EUR").total).toBe("1500.00");
    // The amount loses the sign the site stores it with; the type carries it.
    expect(document.movements[0]).toMatchObject({ type: "expense", amount: "25.50", categoryId: "food", merchant: "Pingo Doce" });
    expect(monthReport(document, "2026-09").spent).toBe("25.50");
  });

  it("keeps a transfer as two legs that know which one paid", () => {
    const { document } = documentFromSite({
      ...base,
      transactions: [
        transaction({ id: "out", type: "transfer", amount: "-200.00", categoryId: null }),
        transaction({ id: "in", accountId: "s", type: "transfer", amount: "200.00", categoryId: null }),
      ],
      transfers: [{ fromTransactionId: "out", toTransactionId: "in" }],
    });
    expect(document.movements.map((m) => [m.id, m.type, m.transferOut, m.transferId])).toEqual([
      ["out", "transfer", true, "in"],
      ["in", "transfer", false, "out"],
    ]);
    // A transfer is not spending, here as everywhere else.
    expect(monthReport(document, "2026-09").spent).toBe("0.00");
  });

  it("leaves behind what does not fit, and says what and why", () => {
    const { document, leftOut } = documentFromSite({
      ...base,
      accounts: [...base.accounts, account({ id: "old", name: "Closed", active: false })],
      transactions: [
        transaction(),
        transaction({ id: "t2", type: "investment_contribution", amount: "-300.00" }),
        transaction({ id: "t3", accountId: "old", amount: "-10.00" }),
        transaction({ id: "t4", currency: "USD", amount: "-40.00" }),
        transaction({ id: "t5", type: "transfer", amount: "-15.00", categoryId: null }),
      ],
      budgets: [
        { id: "b1", name: "Food", period: "monthly", limitAmount: "300.00", active: true, categoryIds: ["food"] },
        { id: "b2", name: "Week", period: "weekly", limitAmount: "50.00", active: true, categoryIds: ["food"] },
        { id: "b3", name: "Two", period: "monthly", limitAmount: "80.00", active: true, categoryIds: ["food", "pay"] },
      ],
    });

    expect(document.movements.map((m) => m.id)).toEqual(["t1"]);
    expect(document.budgets).toEqual([{ id: "b1", categoryId: "food", limit: "300.00", period: "monthly" }]);
    expect(leftOut.map((l) => [l.what, l.count])).toEqual([
      ["archived accounts", 1],
      ["investment contributions", 1],
      ["movements on archived accounts", 1],
      ["movements in another currency than their account", 1],
      ["halves of a transfer", 1],
      ["budgets", 2],
    ]);
    expect(leftOut.every((l) => l.why.length > 20)).toBe(true);
  });

  it("does not carry a category from the wrong side of the ledger, or one the site does not name", () => {
    const { document } = documentFromSite({
      ...base,
      transactions: [transaction({ categoryId: "pay" }), transaction({ id: "t2", categoryId: "gone" })],
    });
    expect(document.movements.map((m) => m.categoryId)).toEqual([null, null]);
    // "other" is not a side of the ledger a vault knows, so that category stays behind.
    expect(document.categories.map((c) => c.id)).toEqual(["food", "pay"]);
  });
});
