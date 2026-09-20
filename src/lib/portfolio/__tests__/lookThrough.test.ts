import { describe, expect, it } from "vitest";
import { companyKey, lookThrough, sectorMoves } from "../lookThrough";
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

/**
 * The S&P 500 tracker held here: the price source names its ten largest, the
 * manager publishes all 504. Reading the file is the difference between
 * seeing 19% of what the fund holds and seeing all of it.
 */
describe("a fund read from the manager's own file", () => {
  const fund = { symbol: "SXR8.DE", quoteType: "ETF", sector: null, country: null, sectorWeights: null,
    name: "iShares Core S&P 500", topHoldings: [{ symbol: "AAPL", name: "Apple Inc", weight: 0.07 }] };

  const published = [
    { name: "APPLE", weight: 0.07, sector: "technology", country: "United States" },
    { name: "NVIDIA", weight: 0.08, sector: "technology", country: "United States" },
    { name: "EUR CASH", weight: 0.85, sector: null, country: null },
  ];

  it("uses the file instead of the ten largest, never both", () => {
    const out = lookThrough([{ label: "SXR8", value: 100, assetType: "etf", profile: fund, published }]);
    expect(out.companies.map((c) => [c.name, c.viaFunds])).toEqual([
      ["EUR CASH", 85],
      ["NVIDIA", 8],
      ["APPLE", 7],
    ]);
    // All of it seen, and counted as read from the file.
    expect(out.fundSeen).toBe(100);
    expect(out.fundsFromFile).toBe(100);
    expect(out.fundsFromTopTen).toBe(0);
  });

  it("carries each company's sector and country from the file", () => {
    const out = lookThrough([{ label: "SXR8", value: 100, assetType: "etf", profile: fund, published }]);
    const nvidia = out.companies.find((c) => c.name === "NVIDIA");
    expect([nvidia?.sector, nvidia?.country]).toEqual(["technology", "United States"]);
  });

  it("falls back to the ten largest for a fund whose file was not read", () => {
    const out = lookThrough([{ label: "SXR8", value: 100, assetType: "etf", profile: fund }]);
    expect(out.fundsFromTopTen).toBe(100);
    expect(out.fundsFromFile).toBe(0);
    expect(out.fundSeen).toBe(7);
  });

  /** A table of 3 582 rows is not a table; what is left out is counted. */
  it("caps the list and says what it left out", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `COMPANY ${i}`, weight: 1 / 300 }));
    const out = lookThrough([{ label: "F", value: 300, assetType: "etf", profile: fund, published: many }], 250);
    expect(out.companies).toHaveLength(250);
    expect(out.hiddenCompanies).toBe(50);
    expect(out.hiddenValue).toBe(50);
  });

  it("lists every company when asked for no limit", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `COMPANY ${i}`, weight: 1 / 300 }));
    const out = lookThrough([{ label: "F", value: 300, assetType: "etf", profile: fund, published: many }], 0);
    expect(out.companies).toHaveLength(300);
    expect(out.hiddenCompanies).toBe(0);
  });
});

/**
 * The company's own move, never presented as your return: you bought the
 * fund, and what its slice of a company cost you is not knowable.
 */
describe("how the companies and sectors have moved", () => {
  const etf: AssetProfile = {
    symbol: "SXR8.DE", quoteType: "ETF", sector: null, country: null, sectorWeights: null, name: "Core S&P 500",
  };
  const published = [
    { name: "NVIDIA", weight: 0.5, sector: "technology", country: "United States", symbol: "NVDA" },
    { name: "APPLE", weight: 0.3, sector: "technology", country: "United States", symbol: "AAPL" },
    { name: "VONOVIA SE", weight: 0.2, sector: "realestate", country: "Germany", symbol: "VNA.DE" },
  ];
  const moves = new Map([
    ["NVDA", { m1: 5.5, y1: 21.06 }],
    ["VNA.DE", { m1: -2, y1: -31.66 }],
  ]);
  const items = [{ label: "SXR8", value: 100, assetType: "etf", profile: etf, published }];

  it("puts each company's yearly move on its row, and nothing where none was read", () => {
    const out = lookThrough(items, 250, moves);
    expect(out.companies.map((c) => [c.name, c.symbol, c.changes.y1 ?? null, c.changes.m1 ?? null])).toEqual([
      ["NVIDIA", "NVDA", 21.06, 5.5],
      // Nothing read for Apple: no window, and not a flat one either.
      ["APPLE", "AAPL", null, null],
      ["VONOVIA SE", "VNA.DE", -31.66, -2],
    ]);
  });

  /**
   * Weighted by what is held, so a 50 EUR company moving 20% counts for more
   * than a 1 EUR one moving 100%.
   */
  it("averages a sector's moves by what you hold of each company", () => {
    const out = sectorMoves(lookThrough(items, 250, moves).companies);
    const technology = out.find((s) => s.sector === "technology");
    // Only NVIDIA was measured: 50 of the 80 EUR in technology.
    expect(technology).toEqual({ sector: "technology", window: "y1", value: 80, measured: 50, change: 21.06 });
    expect(out.find((s) => s.sector === "realestate")).toEqual({
      sector: "realestate", window: "y1", value: 20, measured: 20, change: -31.66,
    });
  });

  it("follows whichever window is asked for", () => {
    const overAMonth = sectorMoves(lookThrough(items, 250, moves).companies, "m1");
    expect(overAMonth.map((s) => [s.sector, s.change])).toEqual([
      ["technology", 5.5],
      ["realestate", -2],
    ]);
  });

  it("orders sectors by what rose most", () => {
    expect(sectorMoves(lookThrough(items, 250, moves).companies).map((s) => s.sector)).toEqual([
      "technology",
      "realestate",
    ]);
  });

  /** A sector nothing was measured in has no move — not a move of zero. */
  it("reports no move rather than a flat one", () => {
    const out = sectorMoves(lookThrough(items, 250, new Map()).companies);
    expect(out.every((s) => s.change === null)).toBe(true);
    expect(out.every((s) => s.measured === 0)).toBe(true);
  });
});
