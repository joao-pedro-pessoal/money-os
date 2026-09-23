import { describe, expect, it } from "vitest";
import {
  addAccount,
  addCategory,
  addMovement,
  addTransfer,
  cents,
  emptyDocument,
  fromCents,
  readDocument,
  removeMovement,
  totalIn,
  VaultDocumentError,
  type VaultDocument,
} from "../document";

const account = (id: string, over: Partial<Parameters<typeof addAccount>[1]> = {}) => ({
  id,
  name: id,
  kind: "bank" as const,
  currency: "EUR",
  balance: "100.00",
  createdAt: "2026-01-01",
  ...over,
});

const movement = (id: string, over: Partial<Parameters<typeof addMovement>[1]> = {}) => ({
  id,
  accountId: "a",
  type: "expense" as const,
  amount: "12.34",
  currency: "EUR",
  date: "2026-09-20",
  categoryId: null,
  merchant: null,
  description: "",
  transferId: null,
  transferOut: null,
  ...over,
});

function start(): VaultDocument {
  let doc = emptyDocument("EUR");
  doc = addAccount(doc, account("a"));
  doc = addAccount(doc, account("b", { name: "Savings", balance: "0.00" }));
  doc = addCategory(doc, { id: "food", name: "Food", kind: "expense" });
  doc = addCategory(doc, { id: "pay", name: "Salary", kind: "income" });
  return doc;
}

describe("amounts", () => {
  it("keeps every cent through a thousand additions", () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += cents("0.10");
    expect(fromCents(total)).toBe("100.00");
    expect(cents("-3.5")).toBe(-350);
    expect(fromCents(-350)).toBe("-3.50");
  });

  it("refuses what is not an amount", () => {
    expect(() => cents("1,50")).toThrow(VaultDocumentError);
    expect(() => cents("1.005")).toThrow(VaultDocumentError);
  });
});

describe("movements", () => {
  it("lowers the balance for an expense and raises it for income", () => {
    let doc = addMovement(start(), movement("m1", { categoryId: "food" }));
    expect(doc.accounts[0].balance).toBe("87.66");
    doc = addMovement(doc, movement("m2", { type: "income", amount: "1000.00", categoryId: "pay" }));
    expect(doc.accounts[0].balance).toBe("1087.66");
  });

  it("puts the balance back when a movement is removed", () => {
    const doc = start();
    const after = removeMovement(addMovement(doc, movement("m1")), "m1");
    expect(after.accounts[0].balance).toBe(doc.accounts[0].balance);
    expect(after.movements).toEqual([]);
  });

  it("refuses a category from the other side of the ledger", () => {
    expect(() => addMovement(start(), movement("m1", { categoryId: "pay" }))).toThrow(/income category/);
  });

  it("refuses an unknown account, a missing category and an amount of nothing", () => {
    expect(() => addMovement(start(), movement("m1", { accountId: "nope" }))).toThrow(/not in this vault/);
    expect(() => addMovement(start(), movement("m1", { categoryId: "nope" }))).toThrow(/not in this vault/);
    expect(() => addMovement(start(), movement("m1", { amount: "0" }))).toThrow(/more than zero/);
  });

  it("refuses an amount in a currency the account does not hold", () => {
    expect(() => addMovement(start(), movement("m1", { currency: "USD" }))).toThrow(/has to be in EUR/);
  });

  it("will not take a transfer leg on its own", () => {
    expect(() => addMovement(start(), movement("m1", { type: "transfer" }))).toThrow(/both its legs/);
  });
});

describe("transfers", () => {
  const move = (doc: VaultDocument) =>
    addTransfer(doc, { fromId: "a", toId: "b", amount: "25.00", date: "2026-09-20", outId: "out", inId: "in" });

  it("moves money between your own accounts without inventing income or an expense", () => {
    const doc = move(start());
    expect(doc.accounts.map((a) => a.balance)).toEqual(["75.00", "25.00"]);
    expect(doc.movements.map((m) => m.type)).toEqual(["transfer", "transfer"]);
    expect(doc.movements.map((m) => m.transferOut)).toEqual([true, false]);
  });

  it("removes both legs together, whichever one you pick, and however they are sorted", () => {
    const doc = move(start());
    const sorted = { ...doc, movements: [...doc.movements].reverse() };
    for (const [from, pick] of [
      [doc, "out"],
      [sorted, "in"],
    ] as const) {
      const after = removeMovement(from, pick);
      expect(after.movements).toEqual([]);
      expect(after.accounts.map((a) => a.balance)).toEqual(["100.00", "0.00"]);
    }
  });

  it("refuses one account, and two currencies, rather than inventing a rate", () => {
    let doc = start();
    doc = addAccount(doc, account("usd", { currency: "USD", balance: "0.00" }));
    expect(() => addTransfer(doc, { fromId: "a", toId: "a", amount: "5.00", date: "2026-09-20", outId: "o", inId: "i" })).toThrow(
      /two different accounts/
    );
    expect(() => addTransfer(doc, { fromId: "a", toId: "usd", amount: "5.00", date: "2026-09-20", outId: "o", inId: "i" })).toThrow(
      /EUR.*USD/
    );
  });
});

describe("the document itself", () => {
  it("adds up only the accounts in the currency asked for, and names the rest", () => {
    let doc = start();
    doc = addAccount(doc, account("usd", { currency: "USD", balance: "40.00" }));
    expect(totalIn(doc, "EUR")).toEqual({ total: "100.00", leftOut: ["USD"] });
  });

  it("refuses a shape it does not understand instead of half-reading it", () => {
    expect(() => readDocument({ version: 1 })).toThrow(VaultDocumentError);
    expect(() => readDocument({ ...emptyDocument("EUR"), surprise: true })).toThrow(VaultDocumentError);
    expect(readDocument(JSON.parse(JSON.stringify(start())))).toEqual(start());
  });

  it("will not grow a second category with the same name and side", () => {
    expect(() => addCategory(start(), { id: "food2", name: "food", kind: "expense" })).toThrow(/already/);
    // The same word on the other side of the ledger is a different thing.
    expect(addCategory(start(), { id: "food2", name: "Food", kind: "income" }).categories).toHaveLength(3);
  });
});
