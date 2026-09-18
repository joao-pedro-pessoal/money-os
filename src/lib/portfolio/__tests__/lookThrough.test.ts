import { describe, expect, it } from "vitest";
import { companyKey, lookThrough } from "../lookThrough";
import type { AssetProfile } from "../exposure";

const fund = (name: string, holdings: [string, number][]): AssetProfile => ({
  symbol: name,
  quoteType: "ETF",
  sector: null,
  country: null,
  sectorWeights: null,
  name,
  topHoldings: holdings.map(([n, weight]) => ({ symbol: null, name: n, weight })),
});

const share = (name: string): AssetProfile => ({
  symbol: name,
  quoteType: "EQUITY",
  sector: "technology",
  country: "United States",
  sectorWeights: null,
  name,
});

describe("companyKey", () => {
  it("reads one company under different listings as one", () => {
    expect(companyKey("Apple Inc")).toBe(companyKey("Apple Inc."));
    expect(companyKey("Alphabet Inc Class A")).toBe(companyKey("Alphabet Inc. Class A"));
    expect(companyKey("NVIDIA Corp")).toBe(companyKey("NVIDIA Corporation"));
    expect(companyKey("Apple Inc")).not.toBe(companyKey("Microsoft Corp"));
  });
});

describe("lookThrough", () => {
  it("adds a company held directly to the same company inside funds", () => {
    const r = lookThrough([
      { label: "APC", value: 500, assetType: "stock", profile: share("Apple Inc.") },
      { label: "World", value: 1000, assetType: "etf", profile: fund("MSCI World", [["Apple Inc", 0.05], ["NVIDIA Corp", 0.05]]) },
      { label: "S&P", value: 1000, assetType: "etf", profile: fund("S&P 500", [["Apple Inc", 0.07]]) },
    ]);
    const apple = r.companies[0];
    expect(apple).toMatchObject({ direct: 500, viaFunds: 120, total: 620, funds: ["S&P 500", "MSCI World"] });
    expect(apple.percent).toBeCloseTo((620 / 2500) * 100);
    expect(r.fundValue).toBe(2000);
    expect(r.fundSeen).toBe(170);
  });

  it("keeps a fund with no reported holdings apart, never spread by guess", () => {
    const r = lookThrough([
      { label: "Bond fund", value: 800, assetType: "etf", profile: fund("Bonds", []) },
      { label: "Unknown ETF", value: 200, assetType: "etf", profile: null },
    ]);
    expect(r.companies).toEqual([]);
    expect(r.fundsWithoutHoldings).toBe(1000);
  });

  it("leaves out everything that is not a stock or fund, and shorts", () => {
    const r = lookThrough([
      { label: "BTC", value: 5000, assetType: "crypto", profile: null },
      { label: "Short", value: -100, assetType: "stock", profile: share("Tesla Inc") },
    ]);
    expect(r.total).toBe(0);
    expect(r.companies).toEqual([]);
  });

  it("shows only the largest companies", () => {
    const holdings: [string, number][] = Array.from({ length: 10 }, (_, i) => [`Company ${String.fromCharCode(65 + i)}${i}x`, 0.01 * (i + 1)]);
    const r = lookThrough([{ label: "F", value: 1000, assetType: "etf", profile: fund("F", holdings) }], 3);
    expect(r.companies.map((c) => c.viaFunds)).toEqual([100, 90, 80]);
  });
});
