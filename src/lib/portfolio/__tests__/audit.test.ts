import { describe, it, expect } from "vitest";
import { auditByPlatform, portfolioSummary, type PositionItem } from "../positionView";

const item = (over: Partial<PositionItem>): PositionItem => ({
  id: Math.random().toString(),
  symbol: "X",
  side: "long",
  accountName: "A",
  platform: "trading212",
  assetType: "etf",
  playlistName: null,
  riskLevel: null,
  timeHorizon: null,
  value: 100,
  notional: 100,
  leverage: null,
  pnl: 0,
  source: "synced",
  insideBalance: true,
  apr: null,
  ...over,
});

describe("reconciling the totals per platform", () => {
  it("splits the same numbers the cards show", () => {
    const items = [
      item({ platform: "trading212", value: 125.28, assetType: "etf" }),
      item({ platform: "trading212", value: 0.11, assetType: "cash", source: "balance" }),
      item({ platform: "bybit", value: 51.67, assetType: "crypto" }),
    ];

    const rows = auditByPlatform(items);
    const all = portfolioSummary(items);

    // The breakdown must add up to the headline, or it explains nothing.
    expect(rows.reduce((s, r) => s + r.floating, 0)).toBeCloseTo(all.floating, 2);
    expect(rows.reduce((s, r) => s + r.stable, 0)).toBeCloseTo(all.stable, 2);
  });

  it("puts the largest platform first", () => {
    const rows = auditByPlatform([
      item({ platform: "small", value: 10 }),
      item({ platform: "big", value: 500 }),
    ]);
    expect(rows.map((r) => r.platform)).toEqual(["big", "small"]);
  });

  it("counts positions without counting balance rows as positions", () => {
    const rows = auditByPlatform([
      item({ platform: "p", source: "synced" }),
      item({ platform: "p", source: "manual" }),
      item({ platform: "p", source: "balance", assetType: "cash" }),
    ]);
    expect(rows[0].positions).toBe(2);
  });

  it("says nothing about an empty portfolio", () => {
    expect(auditByPlatform([])).toEqual([]);
  });
});

describe("flagging cash that already backs the positions", () => {
  it("flags a platform reporting its margin pool alongside open trades", () => {
    // A margin exchange's coin balances are the collateral for its own
    // positions. Counting both adds the margin twice, and the total looks
    // plausible while being wrong by exactly that amount.
    const rows = auditByPlatform([
      item({ platform: "bybit", source: "synced", value: 50 }),
      item({ platform: "bybit", source: "balance", insideBalance: true, assetType: "stablecoin", value: 100 }),
    ]);
    expect(rows[0].mayOverlap).toBe(true);
  });

  it("does not flag free cash reported beside the positions", () => {
    // Trading 212's cash is what's available to trade, not what backs the
    // ETFs. Nothing overlaps, and warning about it would be noise.
    const rows = auditByPlatform([
      item({ platform: "trading212", source: "synced", value: 125.28 }),
      item({
        platform: "trading212",
        source: "balance",
        insideBalance: false,
        assetType: "cash",
        value: 0.11,
      }),
    ]);
    expect(rows[0].mayOverlap).toBe(false);
  });

  it("does not flag cash on a platform with no positions at all", () => {
    const rows = auditByPlatform([
      item({ platform: "bank", source: "balance", insideBalance: true, assetType: "cash", value: 500 }),
    ]);
    expect(rows[0].mayOverlap).toBe(false);
  });

  it("does not flag positions with no cash row", () => {
    const rows = auditByPlatform([item({ platform: "ibkr", source: "synced" })]);
    expect(rows[0].mayOverlap).toBe(false);
  });
});
