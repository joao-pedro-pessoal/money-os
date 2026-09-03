import { describe, it, expect } from "vitest";
import { accountFreeCash, explainFree } from "../unallocated";
import { freeCash, eligibleCash } from "../index";

/**
 * The screen that produced this file showed, on one row:
 *
 *     Interactive Brokers    34.24 USD    allocated 0.00    free 134.24
 *
 * More money committed to nothing than the account contained. Two columns, two
 * sources: the balance came from the connector's equity, the free figure from
 * `accounts.balance` — a stored number a manual 100 had pushed above what the
 * venue held, and which the last sync (status: error) never corrected.
 */
const IBKR = { id: "ibkr", balance: 134.24, investedValue: null };
const IBKR_PLATFORM = { available: 10.34, spot: 10.6, marginUsed: 0 };

describe("free cash on a connected account", () => {
  it("reports what the platform holds, not what the stored balance claims", () => {
    expect(accountFreeCash(IBKR, 0, IBKR_PLATFORM).free).toBe(10.34);
  });

  it("never lets free exceed the stale local balance by accident", () => {
    // The specific reading that made no sense on screen.
    expect(accountFreeCash(IBKR, 0, IBKR_PLATFORM).free).not.toBe(134.24);
  });

  /**
   * `available` already contains the spot pool. Passing it as both the platform
   * availability and the separate pool would have doubled it to 20.94.
   */
  it("names the separate pool without counting it twice", () => {
    const v = accountFreeCash(IBKR, 0, IBKR_PLATFORM);
    expect(v.inSeparatePool).toBe(10.6);
    expect(v.free).toBe(10.34);
  });

  it("still deducts buckets from a connected account", () => {
    const v = accountFreeCash(IBKR, 4, IBKR_PLATFORM);
    expect(v.free).toBe(6.34);
    expect(v.reservedForBuckets).toBe(4);
  });

  /**
   * A connector that reports nothing spendable means nothing is spendable. The
   * stored balance is not consulted as a fallback — falling back to it is how
   * the two figures diverged.
   */
  it("does not fall back to the stored balance when the platform reports zero", () => {
    const v = accountFreeCash(IBKR, 0, { available: 0, spot: 0, marginUsed: 0 });
    expect(v.free).toBe(0);
  });
});

describe("free cash on a manual account", () => {
  it("is the balance when nothing is committed", () => {
    expect(accountFreeCash({ id: "a", balance: 500 }, 0).free).toBe(500);
  });

  /** Trade Republic: one balance covering card money and ETFs. */
  it("excludes the invested half of a split balance", () => {
    const v = accountFreeCash({ id: "tr", balance: 451.41, investedValue: 450.83 }, 0);
    expect(v.free).toBe(0.58);
  });

  /**
   * The dashboard used to explain the manual figure from `a.balance` directly,
   * so a split account was handed an explanation of a number no column showed.
   */
  it("explains the same figure it reports", () => {
    const v = accountFreeCash({ id: "tr", balance: 451.41, investedValue: 450.83 }, 300);
    expect(v.free).toBe(-299.42);
    expect(explainFree(v, "EUR")).toContain("0.58 EUR is assigned to buckets");
    expect(explainFree(v, "EUR")).toContain(
      "buckets promise more than this account can currently spend"
    );
  });
});

/**
 * `freeCash` is the primitive the manual path is defined to equal. Asserted
 * rather than assumed, so the two cannot drift into the second definition this
 * whole change exists to remove.
 */
describe("the manual path agrees with the primitive", () => {
  const cases = [
    { account: { id: "a", balance: 500 }, allocated: 0 },
    { account: { id: "a", balance: 500 }, allocated: 300 },
    { account: { id: "a", balance: 100 }, allocated: 250 },
    { account: { id: "tr", balance: 451.41, investedValue: 450.83 }, allocated: 0 },
    { account: { id: "tr", balance: 1000, investedValue: 600 }, allocated: 150 },
    { account: { id: "z", balance: 0 }, allocated: 50 },
    // An invested figure larger than the account it sits in is a contradiction;
    // both sides must resolve it the same way rather than one going negative.
    { account: { id: "x", balance: 10, investedValue: 999 }, allocated: 0 },
  ];

  for (const { account, allocated } of cases) {
    it(`agrees for balance ${account.balance} / allocated ${allocated}`, () => {
      expect(accountFreeCash(account, allocated).free).toBe(
        freeCash(account, [{ accountId: account.id, amount: allocated }])
      );
    });
  }

  it("is built on eligible cash, not the raw balance", () => {
    const split = { id: "tr", balance: 1000, investedValue: 600 };
    expect(accountFreeCash(split, 0).free).toBe(eligibleCash(split));
    expect(accountFreeCash(split, 0).free).not.toBe(split.balance);
  });
});
