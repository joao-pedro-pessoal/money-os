import { describe, expect, it } from "vitest";
import { feesByYear, fundCosts, type FeeRow } from "../costs";
import { cumulativePnl } from "@/lib/trading/stats";
import type { AssetProfile } from "../exposure";

const fund = (name: string, ter: number | null): AssetProfile => ({
  symbol: name,
  quoteType: "ETF",
  sector: null,
  country: null,
  sectorWeights: null,
  name,
  expenseRatio: ter,
});

describe("fundCosts", () => {
  it("works out what each fund takes a year, and the weighted average", () => {
    const c = fundCosts([
      { label: "World", value: 10_000, assetType: "etf", profile: fund("MSCI World", 0.002) },
      { label: "EM", value: 2_000, assetType: "etf", profile: fund("Emerging", 0.0018) },
      { label: "Apple", value: 5_000, assetType: "stock", profile: null },
    ]);
    expect(c.funds.map((f) => [f.name, f.yearly])).toEqual([
      ["MSCI World", 20],
      ["Emerging", 3.6],
    ]);
    expect(c.yearly).toBe(23.6);
    expect(c.covered).toBe(12_000);
    expect(c.weightedTer).toBeCloseTo(23.6 / 12_000);
  });

  it("lists a fund with no reported TER as unknown, never as free", () => {
    const c = fundCosts([
      { label: "Mystery", value: 3_000, assetType: "etf", profile: fund("Mystery ETF", null) },
      { label: "Unread", value: 1_000, assetType: "etf", profile: null },
    ]);
    expect(c.yearly).toBe(0);
    expect(c.weightedTer).toBeNull();
    expect(c.unknown).toEqual([
      { name: "Mystery ETF", value: 3_000 },
      { name: "Unread", value: 1_000 },
    ]);
  });
});

describe("feesByYear", () => {
  const row = (over: Partial<FeeRow>): FeeRow => ({
    date: "2026-03-01T10:00:00Z",
    type: "BUY",
    symbol: "SXR8",
    quantity: 1,
    amount: -100,
    fees: 1,
    realizedPnl: null,
    description: null,
    accountName: "IBKR",
    ...over,
  });

  it("adds trade fees and fee movements by year and account", () => {
    const years = feesByYear([
      row({}),
      row({ type: "SELL", amount: 120, fees: 1.5, accountName: "Trading 212" }),
      row({ type: "FEE", symbol: null, amount: -2.5, fees: null, description: "Custody" }),
      row({ date: "2025-06-01T10:00:00Z", fees: 4 }),
      row({ type: "DIVIDEND", amount: 3, fees: null }),
    ]);
    expect(years.map((y) => [y.year, y.trading, y.other, y.total])).toEqual([
      ["2026", 2.5, 2.5, 5],
      ["2025", 4, 0, 4],
    ]);
    expect(years[0].accounts).toEqual([
      { name: "IBKR", total: 3.5 },
      { name: "Trading 212", total: 1.5 },
    ]);
  });

  it("counts trade fees exactly as Trade history does", () => {
    const rows = [row({ fees: 1.25 }), row({ type: "SELL", amount: 50, fees: 0.75, date: "2026-04-01T00:00:00Z" })];
    expect(feesByYear(rows)[0].trading).toBe(cumulativePnl(rows).at(-1)!.fees);
  });
});
