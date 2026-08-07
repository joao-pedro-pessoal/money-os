import { describe, it, expect } from "vitest";
import {
  eligibleCash,
  allocatedCash,
  freeCash,
  netWorth,
  reconciliationState,
  overallocatedAmount,
  bucketTotal,
  isCashFlowRelevant,
} from "../index";

const account = (id: string, balance: number) => ({ id, balance });

describe("eligibleCash", () => {
  it("equals the account balance in V1", () => {
    expect(eligibleCash(account("a1", 3000))).toBe(3000);
  });
});

describe("allocatedCash", () => {
  it("sums allocations for a given account only", () => {
    const allocations = [
      { accountId: "a1", amount: 1500 },
      { accountId: "a1", amount: 700 },
      { accountId: "a2", amount: 999 },
    ];
    expect(allocatedCash("a1", allocations)).toBe(2200);
  });

  it("returns 0 when there are no allocations", () => {
    expect(allocatedCash("a1", [])).toBe(0);
  });
});

describe("freeCash", () => {
  it("matches the worked example from MVP_SPEC.md", () => {
    // Trade Republic: Total 3000, Allocated 2700, Free 300
    const acc = account("tr", 3000);
    const allocations = [{ accountId: "tr", amount: 2700 }];
    expect(freeCash(acc, allocations)).toBe(300);
  });

  it("goes negative when overallocated (caller decides how to surface this)", () => {
    const acc = account("tr", 1500);
    const allocations = [{ accountId: "tr", amount: 1900 }];
    expect(freeCash(acc, allocations)).toBe(-400);
  });
});

describe("netWorth", () => {
  it("sums balances across accounts", () => {
    const accounts = [account("a1", 3000), account("a2", 2000), account("a3", 1000)];
    expect(netWorth(accounts)).toBe(6000);
  });

  it("is unaffected by how money is distributed across buckets", () => {
    // Net worth only cares about account balances, never bucket allocations.
    const accounts = [account("a1", 5000)];
    expect(netWorth(accounts)).toBe(5000);
  });
});

describe("reconciliationState", () => {
  const now = new Date("2026-08-07T00:00:00Z");

  it("is RECONCILED when fresh and not overallocated", () => {
    const acc = account("a1", 3000);
    const allocations = [{ accountId: "a1", amount: 2700 }];
    const updated = new Date("2026-08-01T00:00:00Z"); // 6 days old
    expect(reconciliationState(acc, allocations, updated, now)).toBe("RECONCILED");
  });

  it("is STALE when balance is older than staleAfterDays", () => {
    const acc = account("a1", 3000);
    const allocations: { accountId: string; amount: number }[] = [];
    const updated = new Date("2026-07-01T00:00:00Z"); // 37 days old
    expect(reconciliationState(acc, allocations, updated, now)).toBe("STALE");
  });

  it("is OVERALLOCATED even if the balance is fresh", () => {
    // Real-world scenario from the follow-up critique: buckets say 1900
    // allocated but the real balance dropped to 1500.
    const acc = account("tr", 1500);
    const allocations = [{ accountId: "tr", amount: 1900 }];
    const updated = new Date("2026-08-07T00:00:00Z"); // today
    expect(reconciliationState(acc, allocations, updated, now)).toBe("OVERALLOCATED");
  });

  it("prioritizes OVERALLOCATED over STALE when both are true", () => {
    const acc = account("tr", 1500);
    const allocations = [{ accountId: "tr", amount: 1900 }];
    const updated = new Date("2026-01-01T00:00:00Z"); // very old AND overallocated
    expect(reconciliationState(acc, allocations, updated, now)).toBe("OVERALLOCATED");
  });
});

describe("overallocatedAmount", () => {
  it("returns the positive overage", () => {
    const acc = account("tr", 1500);
    const allocations = [{ accountId: "tr", amount: 1900 }];
    expect(overallocatedAmount(acc, allocations)).toBe(400);
  });

  it("returns 0 when not overallocated", () => {
    const acc = account("tr", 3000);
    const allocations = [{ accountId: "tr", amount: 2700 }];
    expect(overallocatedAmount(acc, allocations)).toBe(0);
  });
});

describe("bucketTotal", () => {
  it("sums allocations across accounts for one bucket (Money Map example)", () => {
    const allocations = [
      { accountId: "tr", bucketId: "emergency", amount: 1500 },
      { accountId: "t212", bucketId: "emergency", amount: 1000 },
      { accountId: "millennium", bucketId: "emergency", amount: 500 },
      { accountId: "tr", bucketId: "car", amount: 700 },
    ];
    expect(bucketTotal("emergency", allocations)).toBe(3000);
  });
});

describe("isCashFlowRelevant", () => {
  it("counts income and expense", () => {
    expect(isCashFlowRelevant("income")).toBe(true);
    expect(isCashFlowRelevant("expense")).toBe(true);
  });

  it("excludes transfers and investment contributions from cash flow", () => {
    expect(isCashFlowRelevant("transfer")).toBe(false);
    expect(isCashFlowRelevant("investment_contribution")).toBe(false);
  });
});
