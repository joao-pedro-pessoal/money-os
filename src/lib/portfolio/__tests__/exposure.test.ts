import { describe, expect, it } from "vitest";
import {
  BONDS,
  CASH,
  OTHER_INSIDE_FUNDS,
  SHARES,
  UNCLASSIFIED,
  assetClasses,
  exposure,
  looksLikeSymbol,
  parseYahooProfile,
  regionOf,
  sectorKey,
  sectorLabel,
  yahooSymbolFor,
  type AssetProfile,
} from "../exposure";

const stock = (sector: string | null, country: string | null): AssetProfile => ({
  symbol: "X",
  quoteType: "EQUITY",
  sector,
  country,
  sectorWeights: null,
});

describe("yahooSymbolFor", () => {
  it("prefers the price source the position already uses", () => {
    expect(yahooSymbolFor("yahoo:SXR8.DE", "SXR8")).toBe("SXR8.DE");
    expect(yahooSymbolFor("sxr8.de", "SXR8")).toBe("SXR8.DE");
    expect(yahooSymbolFor("vod.uk", "VOD")).toBe("VOD.L");
    expect(yahooSymbolFor("mc.fr", "MC")).toBe("MC.PA");
    expect(yahooSymbolFor("aapl.us", "AAPL")).toBe("AAPL");
  });

  it("falls back to the ticker", () => {
    expect(yahooSymbolFor(null, " aapl ")).toBe("AAPL");
    expect(yahooSymbolFor("", "MSFT")).toBe("MSFT");
  });

  it("reads Trading 212's tickers", () => {
    expect(yahooSymbolFor(null, "AAPL_US_EQ")).toBe("AAPL");
    expect(yahooSymbolFor(null, "VUSAl_EQ")).toBe("VUSA.L");
    expect(yahooSymbolFor(null, "SAPd_EQ")).toBe("SAP.DE");
  });

  it("tells a listing from a statement's full name", () => {
    expect(looksLikeSymbol("SXR8.DE")).toBe(true);
    expect(looksLikeSymbol("BRK-B")).toBe(true);
    expect(looksLikeSymbol("ISHARES CORE S&P 500 UCITS ETF")).toBe(false);
  });
});

describe("sectors and regions", () => {
  it("reads both spellings of a sector as one", () => {
    expect(sectorKey("financial-services")).toBe(sectorKey("financial_services"));
    expect(sectorLabel("realestate")).toBe("Real estate");
    expect(sectorLabel("real-estate")).toBe("Real estate");
  });

  it("places countries in a region, and an unknown one in Other", () => {
    expect(regionOf("United States")).toBe("North America");
    expect(regionOf("Portugal")).toBe("Europe");
    expect(regionOf("Japan")).toBe("Asia-Pacific");
    expect(regionOf("Atlantis")).toBe("Other");
  });
});

describe("parseYahooProfile", () => {
  it("reads a company's sector and country", () => {
    const p = parseYahooProfile("SAP.DE", {
      quoteSummary: {
        result: [
          {
            assetProfile: { country: "Germany", sectorKey: "technology", sector: "Technology" },
            quoteType: { quoteType: "EQUITY" },
          },
        ],
      },
    });
    expect(p).toMatchObject({ symbol: "SAP.DE", quoteType: "EQUITY", sector: "technology", country: "Germany", sectorWeights: null, topHoldings: null });
  });

  it("reads a fund's sector weights on its shares, and no country", () => {
    const p = parseYahooProfile("EUNL.DE", {
      quoteSummary: {
        result: [
          {
            summaryProfile: { country: "Ireland" },
            quoteType: { quoteType: "ETF" },
            topHoldings: {
              stockPosition: { raw: 0.9 },
              sectorWeightings: [{ technology: { raw: 0.5 } }, { financial_services: { raw: 0.5 } }, { energy: { raw: 0 } }],
            },
          },
        ],
      },
    });
    expect(p?.country).toBeNull();
    expect(p?.sectorWeights).toEqual({ technology: 0.45, financial_services: 0.45 });
  });

  it("reads a company's announced dividend dates, and a fund's TER", () => {
    const stockProfile = parseYahooProfile("KO", {
      quoteSummary: {
        result: [
          {
            assetProfile: { country: "United States", sectorKey: "consumer-defensive" },
            quoteType: { quoteType: "EQUITY" },
            calendarEvents: { exDividendDate: { raw: 1789430400 }, dividendDate: { raw: 1790812800 } },
          },
        ],
      },
    });
    expect(stockProfile).toMatchObject({ exDividendDate: "2026-09-15", dividendDate: "2026-10-01" });
    const fundProfile = parseYahooProfile("SXR8.DE", {
      quoteSummary: {
        result: [
          {
            quoteType: { quoteType: "ETF" },
            fundProfile: { feesExpensesInvestment: { annualReportExpenseRatio: { raw: 0.0007 } } },
            topHoldings: { holdings: [], sectorWeightings: [{ technology: { raw: 1 } }] },
          },
        ],
      },
    });
    expect(fundProfile?.expenseRatio).toBe(0.0007);
    // A TER outside 0–5% is a unit mix-up in the source, not a fund.
    const odd = parseYahooProfile("X", {
      quoteSummary: { result: [{ quoteType: { quoteType: "ETF" }, fundProfile: { feesExpensesInvestment: { annualReportExpenseRatio: { raw: 20 } } } }] },
    });
    expect(odd?.expenseRatio).toBeNull();
  });

  it("gives nothing for an error answer", () => {
    expect(parseYahooProfile("X", { quoteSummary: { result: null, error: { code: "Not Found" } } })).toBeNull();
  });
});

describe("exposure", () => {
  it("adds stocks by sector and leaves everything else out, saying how much", () => {
    const e = exposure(
      [
        { value: 600, assetType: "stock", profile: stock("technology", "United States") },
        { value: 400, assetType: "stock", profile: stock("energy", "Portugal") },
        { value: 1000, assetType: "crypto", profile: null },
      ],
      "sector"
    );
    expect(e.total).toBe(1000);
    expect(e.excluded).toBe(1000);
    expect(e.slices.map((s) => [s.name, s.value])).toEqual([
      ["Technology", 600],
      ["Energy", 400],
    ]);
    expect(e.slices[0].percent).toBeCloseTo(60);
  });

  it("spreads a fund by its weights, and what they do not cover is unclassified", () => {
    const fund: AssetProfile = { symbol: "F", quoteType: "ETF", sector: null, country: null, sectorWeights: { technology: 0.3, healthcare: 0.6 } };
    const e = exposure([{ value: 1000, assetType: "etf", profile: fund }], "sector");
    expect(e.slices.map((s) => [s.name, s.value])).toEqual([
      ["Healthcare", 600],
      ["Technology", 300],
      [UNCLASSIFIED, 100],
    ]);
  });

  it("never guesses a fund's country", () => {
    const fund: AssetProfile = { symbol: "F", quoteType: "ETF", sector: null, country: null, sectorWeights: { technology: 1 } };
    const e = exposure(
      [
        { value: 300, assetType: "etf", profile: fund },
        { value: 100, assetType: "stock", profile: stock("technology", "Japan") },
      ],
      "region"
    );
    expect(e.slices.map((s) => [s.name, s.value])).toEqual([
      ["Asia-Pacific", 100],
      [UNCLASSIFIED, 300],
    ]);
  });

  it("counts a position with no profile as unclassified, never as zero", () => {
    const e = exposure([{ value: 250, assetType: "stock", profile: null }], "country");
    expect(e.total).toBe(250);
    expect(e.slices).toEqual([{ name: UNCLASSIFIED, value: 250, percent: 100 }]);
  });

  it("leaves out shorts and empty positions", () => {
    const e = exposure(
      [
        { value: -50, assetType: "stock", profile: stock("energy", "Norway") },
        { value: 0, assetType: "etf", profile: null },
      ],
      "sector"
    );
    expect(e).toEqual({ slices: [], total: 0, excluded: 0 });
  });
});

/**
 * The real portfolio in September 2026: two iShares Global Govt Bond listings
 * reporting 99.67% bonds, WisdomTree Physical Silver reporting 100% "other",
 * iShares Physical Gold reporting nothing at all because it lists as a share,
 * and 338.09 EUR of crypto and cash that no sector describes.
 */
describe("everything held, by kind", () => {
  const fund = (allocation: { shares: number; bonds: number; cash: number; other: number } | null): AssetProfile => ({
    symbol: "F", quoteType: "ETF", sector: null, country: null, sectorWeights: null, assetAllocation: allocation,
  });
  const item = (value: number, assetType: string | null, profile: AssetProfile | null = null) => ({ value, assetType, profile });

  it("sends a bond fund's value to bonds, by what the fund reports", () => {
    const govt = fund({ shares: 0, bonds: 0.9967, cash: 0.0034, other: 0 });
    const out = assetClasses([item(100, "etf", govt)]);
    expect(out.slices.find((s) => s.name === BONDS)?.value).toBe(99.67);
    expect(out.slices.find((s) => s.name === CASH)?.value).toBe(0.34);
    expect(out.total).toBe(100);
  });

  it("splits an equity fund into its shares and its cash", () => {
    const sp500 = fund({ shares: 0.998, bonds: 0, cash: 0.002, other: 0 });
    const out = assetClasses([item(500, "etf", sp500), item(100, "stock")]);
    expect(out.slices.find((s) => s.name === SHARES)?.value).toBe(599);
    expect(out.slices.find((s) => s.name === CASH)?.value).toBe(1);
  });

  it("keeps a metal ETC's 'other' as the fund's own word for it", () => {
    const silver = fund({ shares: 0, bonds: 0, cash: 0, other: 1 });
    expect(assetClasses([item(50, "etf", silver)]).slices).toEqual([
      { name: OTHER_INSIDE_FUNDS, value: 50, percent: 100 },
    ]);
  });

  /** iShares Physical Gold: listed as a share, reports no holdings at all. */
  it("leaves a fund that reports nothing unclassified rather than calling it shares", () => {
    expect(assetClasses([item(40, "etf", fund(null))]).slices).toEqual([
      { name: UNCLASSIFIED, value: 40, percent: 100 },
    ]);
  });

  it("lets the type you set answer where the source cannot", () => {
    const out = assetClasses([item(40, "commodity", fund(null))]);
    expect(out.slices).toEqual([{ name: "Commodities", value: 40, percent: 100 }]);
  });

  /** The 338.09 EUR the sector breakdown has to leave out. */
  it("counts crypto and cash, which the sector breakdown cannot", () => {
    const out = assetClasses([item(200, "crypto"), item(138.09, "cash"), item(548.19, "stock")]);
    expect(out.total).toBe(886.28);
    expect(out.excluded).toBe(0);
    expect(out.slices.map((s) => s.name)).toEqual([SHARES, "Crypto", CASH]);
  });

  it("puts what nothing describes last, and never invents a class", () => {
    const out = assetClasses([item(10, null), item(90, "crypto")]);
    expect(out.slices.map((s) => s.name)).toEqual(["Crypto", UNCLASSIFIED]);
  });

  it("leaves out a short and a position worth nothing", () => {
    expect(assetClasses([item(-10, "stock"), item(0, "crypto")]).total).toBe(0);
  });
});

describe("what a fund says it holds, as Yahoo states it", () => {
  const payload = (top: unknown) => ({ quoteSummary: { result: [{ quoteType: { quoteType: "ETF" }, topHoldings: top }] } });

  /** IGLA.L, read live: bonds and a little cash, no sectors, no holdings. */
  it("reads a bond fund's own split", () => {
    const p = parseYahooProfile("IGLA.L", payload({ stockPosition: { raw: 0 }, bondPosition: { raw: 0.9967 }, cashPosition: { raw: 0.0034 }, otherPosition: { raw: 0 } }));
    expect(p?.assetAllocation).toEqual({ shares: 0, bonds: 0.9967, cash: 0.0034, other: 0 });
  });

  it("counts preferred shares as shares and convertibles as bonds", () => {
    const p = parseYahooProfile("X", payload({ stockPosition: 0.6, preferredPosition: 0.1, bondPosition: 0.2, convertiblePosition: 0.1 }));
    expect(p?.assetAllocation).toEqual({ shares: 0.7, bonds: 0.30000000000000004, cash: 0, other: 0 });
  });

  /** EGLN.L: listed as a share, with no holdings block. */
  it("reports nothing where the listing reports nothing", () => {
    expect(parseYahooProfile("EGLN.L", { quoteSummary: { result: [{ quoteType: { quoteType: "EQUITY" } }] } })?.assetAllocation).toBeNull();
  });

  /** All zeros would say "this fund holds nothing", which is a claim. */
  it("refuses a set of figures that adds to nothing", () => {
    expect(parseYahooProfile("X", payload({ stockPosition: 0, bondPosition: 0, cashPosition: 0, otherPosition: 0 }))?.assetAllocation).toBeNull();
  });
});

/**
 * The sector, country and region breakdowns cover shares. A fund that says how
 * much of it is shares takes part with that much of itself; the bonds, the
 * cash and the metal leave, and are counted by kind instead.
 */
describe("a fund that is not all shares", () => {
  const govt: AssetProfile = {
    symbol: "IGLA.L", quoteType: "ETF", sector: null, country: null, sectorWeights: null,
    assetAllocation: { shares: 0, bonds: 0.9967, cash: 0.0034, other: 0 },
  };
  const sp500: AssetProfile = {
    symbol: "SXR8.DE", quoteType: "ETF", sector: null, country: null,
    // Weights are fractions of the whole fund: Yahoo's are already scaled by
    // how much of it is shares.
    sectorWeights: { technology: 0.3, financial_services: 0.2 },
    assetAllocation: { shares: 0.998, bonds: 0, cash: 0.002, other: 0 },
  };

  it("keeps a bond fund out of the sector breakdown altogether", () => {
    const out = exposure([{ value: 100, assetType: "etf", profile: govt }], "sector");
    expect(out.total).toBe(0);
    expect(out.excluded).toBe(100);
    expect(out.slices).toEqual([]);
  });

  it("counts only the shares of an equity fund, and says what the weights miss", () => {
    const out = exposure([{ value: 1000, assetType: "etf", profile: sp500 }], "sector");
    expect(out.total).toBe(998);
    expect(out.excluded).toBe(2);
    expect(out.slices.map((s) => [s.name, s.value])).toEqual([
      ["Technology", 300],
      ["Financial services", 200],
      // The 498 the provider's weights do not name, out of the 998 in shares.
      [UNCLASSIFIED, 498],
    ]);
    expect(out.slices[0].percent).toBeCloseTo(30.06, 2);
  });

  it("does the same by country, where a fund reports none", () => {
    const out = exposure([{ value: 100, assetType: "etf", profile: govt }], "country");
    expect(out.total).toBe(0);
    expect(out.excluded).toBe(100);
  });

  /** Not knowing what a fund holds is not the same as knowing it is all shares. */
  it("leaves a fund that publishes no split whole, and unclassified", () => {
    const silent: AssetProfile = { symbol: "EGLN.L", quoteType: "EQUITY", sector: null, country: null, sectorWeights: null };
    const out = exposure([{ value: 40, assetType: "etf", profile: silent }], "sector");
    expect(out.total).toBe(40);
    expect(out.slices).toEqual([{ name: UNCLASSIFIED, value: 40, percent: 100 }]);
  });
});
