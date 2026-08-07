import { describe, it, expect } from "vitest";
import { marketValue, costBasis, unrealizedPnL, unrealizedPnLPercent, portfolioTotals, reinforcePosition, reducePosition } from "../index";

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

describe("short positions", () => {
  const short = { quantity: 10, avgEntryPrice: 100, currentPrice: 80, direction: "short" as const };

  it("gains when the price falls", () => {
    expect(unrealizedPnL(short)).toBe(200);
    expect(unrealizedPnLPercent(short)).toBe(20);
  });

  it("loses when the price rises", () => {
    expect(unrealizedPnL({ ...short, currentPrice: 130 })).toBe(-300);
  });

  it("values the position as capital at stake plus P&L, not quantity x price", () => {
    // basis 1000, price fell to 80 -> +200 -> worth 1200
    expect(marketValue(short)).toBe(1200);
  });

  it("still treats an explicit long the normal way", () => {
    const long = { quantity: 10, avgEntryPrice: 100, currentPrice: 130, direction: "long" as const };
    expect(unrealizedPnL(long)).toBe(300);
    expect(marketValue(long)).toBe(1300);
  });
});

describe("reinforcePosition", () => {
  it("computes the weighted average entry price", () => {
    // 10 @ 100 then 10 @ 200 -> 20 @ 150
    expect(reinforcePosition({ quantity: 10, avgEntryPrice: 100 }, { quantity: 10, price: 200 })).toEqual({
      quantity: 20,
      avgEntryPrice: 150,
    });
  });

  it("handles uneven sizes", () => {
    // 3 @ 100 + 1 @ 200 = 500 / 4 = 125
    expect(reinforcePosition({ quantity: 3, avgEntryPrice: 100 }, { quantity: 1, price: 200 })).toEqual({
      quantity: 4,
      avgEntryPrice: 125,
    });
  });

  it("starts a position from nothing", () => {
    expect(reinforcePosition({ quantity: 0, avgEntryPrice: 0 }, { quantity: 5, price: 20 })).toEqual({
      quantity: 5,
      avgEntryPrice: 20,
    });
  });
});

describe("reducePosition", () => {
  it("realizes profit on the units sold and leaves the average entry untouched", () => {
    const result = reducePosition({ quantity: 10, avgEntryPrice: 100 }, { quantity: 5, price: 150 });
    expect(result).toEqual({ quantity: 5, avgEntryPrice: 100, realized: 250 });
  });

  it("realizes a loss when selling below the entry price", () => {
    const result = reducePosition({ quantity: 10, avgEntryPrice: 100 }, { quantity: 10, price: 60 });
    expect(result).toEqual({ quantity: 0, avgEntryPrice: 100, realized: -400 });
  });

  it("never sells more than is held", () => {
    const result = reducePosition({ quantity: 3, avgEntryPrice: 100 }, { quantity: 99, price: 120 });
    expect(result.quantity).toBe(0);
    expect(result.realized).toBe(60); // only the 3 actually held
  });

  it("inverts the sign for a short position", () => {
    const result = reducePosition(
      { quantity: 10, avgEntryPrice: 100, direction: "short" },
      { quantity: 5, price: 80 }
    );
    expect(result.realized).toBe(100); // bought back cheaper -> profit
  });
});
