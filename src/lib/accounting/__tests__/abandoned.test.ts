import { describe, it, expect } from "vitest";
import { isAbandoned, reasonsToKeep, pickReusable, type AccountUsage } from "../abandoned";

const empty: AccountUsage = {
  id: "a1",
  name: "Bybit",
  institution: "Bybit",
  balance: 0,
  transactions: 0,
  holdings: 0,
  allocations: 0,
  connections: 0,
  imports: 0,
  snapshots: 0,
};

describe("isAbandoned", () => {
  it("treats an account nothing points at as removable", () => {
    expect(isAbandoned(empty)).toBe(true);
    expect(reasonsToKeep(empty)).toEqual([]);
  });

  it("keeps an account holding money, however little", () => {
    expect(isAbandoned({ ...empty, balance: 0.01 })).toBe(false);
    expect(isAbandoned({ ...empty, balance: -0.01 })).toBe(false);
  });

  it("keeps an overdrawn account", () => {
    // A negative balance is a real debt, not an empty row.
    expect(reasonsToKeep({ ...empty, balance: -420 })).toContain("holds a balance");
  });

  it("ignores float dust below a cent", () => {
    expect(isAbandoned({ ...empty, balance: 0.0000001 })).toBe(true);
  });

  it.each([
    ["transactions", { transactions: 1 }],
    ["holdings", { holdings: 1 }],
    ["allocations", { allocations: 1 }],
    ["connections", { connections: 1 }],
    ["imports", { imports: 1 }],
    ["snapshots", { snapshots: 1 }],
  ])("keeps an account with %s", (_label, patch) => {
    expect(isAbandoned({ ...empty, ...patch })).toBe(false);
  });

  it("lists every reason at once", () => {
    const reasons = reasonsToKeep({ ...empty, balance: 10, transactions: 3, holdings: 1 });
    expect(reasons).toHaveLength(3);
    expect(reasons.join(" ")).toContain("3 transactions");
    expect(reasons.join(" ")).toContain("1 position");
  });
});

describe("pickReusable", () => {
  const withDate = (o: Partial<AccountUsage> & { id: string; createdAt: string }) => ({
    ...empty,
    ...o,
  });

  it("finds an empty account for the same institution", () => {
    const found = pickReusable([withDate({ id: "x", createdAt: "2026-01-01" })], "Bybit");
    expect(found?.id).toBe("x");
  });

  it("matches the institution case- and space-insensitively", () => {
    const found = pickReusable(
      [withDate({ id: "x", institution: "  bybit ", createdAt: "2026-01-01" })],
      "Bybit"
    );
    expect(found?.id).toBe("x");
  });

  it("never steals an account that already has a connection", () => {
    const found = pickReusable(
      [withDate({ id: "x", connections: 1, createdAt: "2026-01-01" })],
      "Bybit"
    );
    expect(found).toBeNull();
  });

  it("never touches a different institution", () => {
    const found = pickReusable(
      [withDate({ id: "x", institution: "Hyperliquid", createdAt: "2026-01-01" })],
      "Bybit"
    );
    expect(found).toBeNull();
  });

  it("picks the oldest so retries land on the same row every time", () => {
    const candidates = [
      withDate({ id: "new", createdAt: "2026-03-01" }),
      withDate({ id: "old", createdAt: "2026-01-01" }),
      withDate({ id: "mid", createdAt: "2026-02-01" }),
    ];
    expect(pickReusable(candidates, "Bybit")?.id).toBe("old");
    // Deterministic: same input, same answer.
    expect(pickReusable([...candidates].reverse(), "Bybit")?.id).toBe("old");
  });

  it("returns null when the only candidate holds money", () => {
    const found = pickReusable([withDate({ id: "x", balance: 5, createdAt: "2026-01-01" })], "Bybit");
    expect(found).toBeNull();
  });
});
