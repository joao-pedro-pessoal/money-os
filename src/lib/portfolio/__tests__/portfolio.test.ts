import { describe, it, expect } from "vitest";
import { marketValue, costBasis, unrealizedPnL, unrealizedPnLPercent, portfolioTotals } from "../index";

const holding = (quantity: number, avgEntryPrice: number, currentPrice: number) => ({
  quantity,
  avgEntryPrice,
  currentPrice,
});

describe("marketValue / costBasis", () => {
  it("computes quantity * price", () => {
    const h = holding(10, 90, 100);
    expect(marketValue(h)).toBe(1000);
    expect(costBasis(h)).toBe(900);
  });
});

describe("unrealizedPnL", () => {
  it("is positive when price is above entry", () => {
    const h = holding(10, 90, 100);
    expect(unrealizedPnL(h)).toBe(100);
    expect(unrealizedPnLPercent(h)).toBeCloseTo(11.11, 1);
  });

  it("is negative when price is below entry", () => {
    const h = holding(10, 100, 80);
    expect(unrealizedPnL(h)).toBe(-200);
    expect(unrealizedPnLPercent(h)).toBe(-20);
  });

  it("handles zero cost basis without dividing by zero", () => {
    const h = holding(10, 0, 5);
    expect(unrealizedPnLPercent(h)).toBe(0);
  });
});

describe("portfolioTotals", () => {
  it("aggregates value, cost and P&L across holdings", () => {
    const holdings = [holding(10, 90, 100), holding(5, 200, 180)];
    // h1: value 1000, cost 900, pnl +100
    // h2: value 900, cost 1000, pnl -100
    const totals = portfolioTotals(holdings);
    expect(totals.totalValue).toBe(1900);
    expect(totals.totalCost).toBe(1900);
    expect(totals.totalPnL).toBe(0);
    expect(totals.totalPnLPercent).toBe(0);
  });

  it("returns zeros for an empty portfolio", () => {
    const totals = portfolioTotals([]);
    expect(totals).toEqual({ totalValue: 0, totalCost: 0, totalPnL: 0, totalPnLPercent: 0 });
  });
});
