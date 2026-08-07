import { describe, it, expect } from "vitest";
import { computeNetWorth, type NetWorthInput } from "../networth";

function input(over: Partial<NetWorthInput> = {}): NetWorthInput {
  return {
    cash: 0,
    manualPortfolio: 0,
    syncedPortfolio: 0,
    openPositionValue: 0,
    floatingPortfolio: 0,
    ...over,
  };
}

describe("computeNetWorth", () => {
  it("adds cash and portfolio", () => {
    const r = computeNetWorth(input({ cash: 100, manualPortfolio: 50, syncedPortfolio: 25 }));
    expect(r.cash).toBe(100);
    expect(r.portfolio).toBe(75);
    expect(r.total).toBe(175);
  });

  // --- The four boundaries that have actually broken in this app ---

  it("never adds open position value, however large", () => {
    const r = computeNetWorth(input({ cash: 31000, openPositionValue: 29000 }));
    expect(r.total).toBe(31000);
    expect(r.excluded.openPositionValue).toBe(29000);
    expect(r.excluded.reason).toMatch(/twice/);
  });

  it("counts synced spot exactly once, on the portfolio side", () => {
    // The connected account's cash is equity only; spot arrives separately.
    const r = computeNetWorth(input({ cash: 0, syncedPortfolio: 87.7 }));
    expect(r.total).toBe(87.7);
  });

  it("keeps manual positions and cash separate", () => {
    const r = computeNetWorth(input({ cash: 1000, manualPortfolio: 250 }));
    expect(r.total).toBe(1250);
  });

  it("splits guaranteed from market-exposed", () => {
    const r = computeNetWorth(
      input({ cash: 100, manualPortfolio: 100, syncedPortfolio: 50, floatingPortfolio: 100 })
    );
    expect(r.total).toBe(250);
    expect(r.floating).toBe(100);
    expect(r.guaranteed).toBe(150);
  });

  it("reports unconverted amounts instead of swallowing them", () => {
    const r = computeNetWorth(input({ cash: 100, unconverted: [{ amount: 5000, currency: "JPY" }] }));
    expect(r.total).toBe(100);
    expect(r.unconverted).toEqual([{ amount: 5000, currency: "JPY" }]);
  });

  it("handles an empty setup", () => {
    const r = computeNetWorth(input());
    expect(r.total).toBe(0);
    expect(r.guaranteed).toBe(0);
  });

  it("handles negative cash without pretending it's zero", () => {
    const r = computeNetWorth(input({ cash: -50, manualPortfolio: 100 }));
    expect(r.total).toBe(50);
  });

  it("rounds to cents rather than accumulating float noise", () => {
    const r = computeNetWorth(input({ cash: 0.1, manualPortfolio: 0.2 }));
    expect(r.total).toBe(0.3);
  });
});
