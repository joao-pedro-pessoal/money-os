import { describe, expect, it } from "vitest";
import {
  UNCLASSIFIED,
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
    expect(p).toEqual({ symbol: "SAP.DE", quoteType: "EQUITY", sector: "technology", country: "Germany", sectorWeights: null });
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
