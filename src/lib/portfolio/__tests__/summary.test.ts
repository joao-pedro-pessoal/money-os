import { describe, it, expect } from "vitest";
import { portfolioSummary, hasPnl, yearlyYield, type PositionItem } from "../positionView";

const p = (o: Partial<PositionItem> & { id: string }): PositionItem => ({
  symbol: o.id,
  side: "long",
  accountName: "acc",
  platform: "x",
  assetType: "stock",
  playlistName: null,
  riskLevel: null,
  timeHorizon: null,
  value: 100,
  notional: o.notional ?? o.value ?? 100,
  leverage: null,
  pnl: 0,
  source: "synced",
  insideBalance: false,
  apr: null,
  ...o,
});

describe("hasPnl", () => {
  it("is false for money whose price doesn't move", () => {
    expect(hasPnl(p({ id: "USDC", assetType: "stablecoin" }))).toBe(false);
    expect(hasPnl(p({ id: "EUR", assetType: "cash" }))).toBe(false);
  });

  it("is true for anything the market can move", () => {
    expect(hasPnl(p({ id: "CCI", assetType: "stock" }))).toBe(true);
    expect(hasPnl(p({ id: "GOLD", assetType: "commodity" }))).toBe(true);
  });

  it("assumes an untagged position can move", () => {
    // Safer than the reverse: hiding a real loss is worse than showing a
    // column of dashes.
    expect(hasPnl(p({ id: "?", assetType: null }))).toBe(true);
  });
});

describe("yearlyYield", () => {
  it("works out a year of interest", () => {
    expect(yearlyYield(p({ id: "USDC", value: 1000, apr: 4.5 }))).toBe(45);
  });

  it("is null without a rate", () => {
    expect(yearlyYield(p({ id: "USDC", value: 1000, apr: null }))).toBeNull();
    expect(yearlyYield(p({ id: "USDC", value: 1000, apr: 0 }))).toBeNull();
  });
});

describe("portfolioSummary", () => {
  const items = [
    p({ id: "USDC", assetType: "stablecoin", value: 83.47 }),
    p({ id: "CCI", assetType: "stock", value: 7.75, pnl: -0.1 }),
    p({ id: "LEGN", assetType: "stock", value: 12.09, pnl: -1.0 }),
    p({ id: "xyz:GOLD", assetType: "commodity", value: 7.69, notional: 197.3, pnl: -0.08 }),
  ];

  it("counts everything held, not just what was typed in by hand", () => {
    // The cards used to read the manual holdings alone: zero of everything,
    // while the table below showed a real loss.
    expect(portfolioSummary(items).held).toBe(111);
  });

  it("sums P&L across the synced positions", () => {
    expect(portfolioSummary(items).pnl).toBe(-1.18);
  });

  it("keeps cash out of the P&L base", () => {
    // A stablecoin can't be up or down, so including it in the cost basis
    // would quietly shrink the percentage towards zero.
    const s = portfolioSummary(items);
    expect(s.floating).toBe(27.53);
    expect(s.stable).toBe(83.47);
    expect(s.cost).toBe(28.71);
  });

  it("reports the percentage against what can actually move", () => {
    const s = portfolioSummary(items);
    expect(s.pnlPercent).toBeCloseTo(-4.11, 1);
  });

  it("carries the notional through for leveraged positions", () => {
    expect(portfolioSummary(items).notional).toBeCloseTo(300.61, 2);
  });

  it("adds up the interest the stable money would earn", () => {
    const withRates = [
      p({ id: "USDC", assetType: "stablecoin", value: 1000, apr: 4 }),
      p({ id: "EUR", assetType: "cash", value: 500, apr: 2 }),
    ];
    const s = portfolioSummary(withRates);
    expect(s.projectedYield).toBe(50);
    expect(s.unratedStable).toBe(0);
  });

  it("says how much stable money has no rate recorded", () => {
    const s = portfolioSummary(items);
    expect(s.unratedStable).toBe(83.47);
    expect(s.projectedYield).toBe(0);
  });

  it("does not divide by zero with no market-exposed money", () => {
    const s = portfolioSummary([p({ id: "USDC", assetType: "stablecoin", value: 100 })]);
    expect(s.pnlPercent).toBe(0);
    expect(Number.isFinite(s.pnlPercent)).toBe(true);
  });

  it("is all zeroes for nothing", () => {
    expect(portfolioSummary([])).toMatchObject({ held: 0, pnl: 0, cost: 0, pnlPercent: 0 });
  });
});
