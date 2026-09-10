import { describe, expect, it } from "vitest";
import {
  buildInvestmentConversionPrompt,
  calculateInvestmentLedger,
  investmentActivityFingerprint,
  parseInvestmentActivity,
} from "../investment-activity";

describe("investment activity CSV", () => {
  it("parses a valid trade", () => {
    const parsed = parseInvestmentActivity({
      date: "2026-01-04",
      type: "buy",
      symbol: "vwce",
      quantity: "5",
      price: "125.00",
      amount: "-626.00",
      fees: "1",
      currency: "eur",
      description: "Buy VWCE",
      external_id: "ord-101",
    });
    expect(parsed.problem).toBeNull();
    expect(parsed.row).toMatchObject({ type: "BUY", symbol: "VWCE", amount: -626, fees: 1 });
  });

  it("rejects a trade without quantity", () => {
    expect(
      parseInvestmentActivity({ date: "2026-01-04", type: "SELL", symbol: "VWCE", amount: 20, currency: "EUR" })
        .problem
    ).toBe("Trades need a symbol and quantity");
  });

  it("uses an external id as the stable duplicate key", () => {
    const base = {
      date: "2026-01-04",
      type: "BUY" as const,
      symbol: "VWCE",
      quantity: 5,
      price: 125,
      amount: -626,
      fees: 1,
      currency: "EUR",
      description: "Buy",
      externalId: "ABC-123",
    };
    expect(investmentActivityFingerprint(base)).toBe("external:abc-123");
    expect(investmentActivityFingerprint({ ...base, amount: -999 })).toBe("external:abc-123");
  });

  it("makes the net-amount and no-invention rules explicit", () => {
    const prompt = buildInvestmentConversionPrompt("USD");
    expect(prompt).toContain("SIGNED NET cash movement");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("Use USD");
  });

  it("keeps buys in portfolio value and calculates average-cost realized P&L", () => {
    const common = { accountId: "broker", currency: "EUR", description: "", externalId: "" };
    const result = calculateInvestmentLedger([
      { ...common, date: "2026-01-01", type: "DEPOSIT", symbol: "", quantity: null, price: null, amount: 1000, fees: null, fingerprint: "1" },
      { ...common, date: "2026-01-02", type: "BUY", symbol: "ABC", quantity: 10, price: 50, amount: -501, fees: 1, fingerprint: "2" },
      { ...common, date: "2026-01-03", type: "SELL", symbol: "ABC", quantity: 4, price: 70, amount: 279, fees: 1, fingerprint: "3" },
    ]);
    expect(result.points.map((point) => point.portfolioValue)).toEqual([0, 500, 420]);
    expect(result.points.map((point) => point.accountEquity)).toEqual([1000, 999, 1198]);
    expect(result.realizedTotal).toBe(78.6);
    expect(result.realizedByFingerprint.get("3")).toBeCloseTo(78.6);
  });

  it("includes dividends, taxes, fees and withdrawals in account equity", () => {
    const common = { accountId: "broker", currency: "EUR", symbol: "", quantity: null, price: null, fees: null, description: "", externalId: "" };
    const result = calculateInvestmentLedger([
      { ...common, date: "2026-01-01", type: "DEPOSIT", amount: 100, fingerprint: "1" },
      { ...common, date: "2026-01-02", type: "DIVIDEND", amount: 10, fingerprint: "2" },
      { ...common, date: "2026-01-03", type: "TAX", amount: -2, fingerprint: "3" },
      { ...common, date: "2026-01-04", type: "WITHDRAWAL", amount: -20, fingerprint: "4" },
    ]);
    expect(result.points.at(-1)?.accountEquity).toBe(88);
    expect(result.realizedTotal).toBe(10);
    expect(result.realizedByFingerprint.get("2")).toBe(10);
  });

  it("returns the remaining position for the current portfolio", () => {
    const common = { accountId: "broker", currency: "EUR", description: "", externalId: "", fees: null };
    const result = calculateInvestmentLedger([
      { ...common, date: "2026-01-01", type: "BUY", symbol: "ABC", quantity: 10, price: 50, amount: -500, fingerprint: "1" },
      { ...common, date: "2026-01-02", type: "SELL", symbol: "ABC", quantity: 4, price: 70, amount: 280, fingerprint: "2" },
    ]);
    expect(result.openPositions).toEqual([{ accountId: "broker", symbol: "ABC", currency: "EUR", quantity: 6, averageCost: 50, mark: 70 }]);
  });
});
