import { describe, it, expect } from "vitest";
import { classifyByName, contradictsStock, normaliseName } from "../nameEvidence";
import { suggestAssetType } from "../assetType";

describe("what a name proves", () => {
  it("reads UCITS as a fund", () => {
    // One rule covers most of a European portfolio: a UCITS fund is a fund by
    // law, whoever issued it.
    expect(classifyByName("iShares Core MSCI World UCITS ETF USD (Acc)")?.value).toBe("etf");
    expect(classifyByName("Vanguard FTSE All-World UCITS ETF")?.value).toBe("etf");
  });

  it("reads an explicit ETF", () => {
    expect(classifyByName("SPDR S&P 500 ETF Trust")?.value).toBe("etf");
  });

  it("treats an exchange-traded commodity as a commodity, not a fund", () => {
    // The wrapper is a fund; what moves the price is metal. The risk analysis
    // cares about the second.
    expect(classifyByName("WisdomTree Physical Silver")?.value).toBe("commodity");
    expect(classifyByName("Invesco Physical Gold ETC")?.value).toBe("commodity");
  });

  it("reads a REIT as real estate", () => {
    expect(classifyByName("Realty Income REIT")?.value).toBe("real_estate");
  });

  it("puts the wrapper before the contents", () => {
    // A bond ETF is an ETF. Reading "Treasury" first would file a fund as a
    // bond and misstate what you actually hold.
    expect(classifyByName("iShares $ Treasury Bond 1-3yr UCITS ETF")?.value).toBe("etf");
    // A Bitcoin ETP is an ETF, not crypto.
    expect(classifyByName("iShares Bitcoin ETP")?.value).toBe("etf");
  });

  it("reads a plain government bond as a bond", () => {
    expect(classifyByName("US Treasury Note 4.25%")?.value).toBe("bond");
  });

  it("says nothing about an ordinary share", () => {
    // The common answer, and the correct one: "Apple Inc" doesn't announce
    // that it's a share, and inferring one from the absence of fund words is
    // exactly the guess this module refuses to make.
    for (const name of ["Apple Inc", "Shell plc", "Galp Energia SGPS", "LVMH"]) {
      expect(classifyByName(name), name).toBeNull();
    }
  });

  it("says nothing about an empty or useless name", () => {
    expect(classifyByName("")).toBeNull();
    expect(classifyByName(null)).toBeNull();
    expect(classifyByName(undefined)).toBeNull();
    expect(classifyByName(" ")).toBeNull();
  });

  it("matches whole words, not fragments", () => {
    // "ETFinance" is not an ETF; "SETC" is not an ETC.
    expect(classifyByName("ETFinance Holdings")).toBeNull();
    expect(classifyByName("SETC Industries")).toBeNull();
  });

  it("survives punctuation and case", () => {
    expect(normaliseName("iShares  Core, MSCI-World UCITS ETF")).toContain(" UCITS ");
    expect(classifyByName("ISHARES CORE MSCI WORLD UCITS ETF")?.value).toBe("etf");
  });
});

describe("overruling a platform that says 'stock'", () => {
  it("corrects a fund filed with the shares", () => {
    expect(contradictsStock("Vanguard FTSE All-World UCITS ETF")?.value).toBe("etf");
  });

  it("leaves an ordinary share alone", () => {
    expect(contradictsStock("Apple Inc")).toBeNull();
  });

  it("doesn't turn a stock into a bond on the strength of a word", () => {
    // Only fund-like evidence may overrule; a bond reading must not, because
    // a company called "Treasury Wine Estates" is a share.
    expect(contradictsStock("Treasury Wine Estates")).toBeNull();
  });
});

describe("the two sources together", () => {
  it("fixes an IBKR ETF, which arrives as STK like every share", () => {
    const d = suggestAssetType({
      platform: "ibkr",
      assetClass: "STK",
      coin: "IWDA",
      instrumentName: "iShares Core MSCI World UCITS ETF",
    });
    expect(d.value).toBe("etf");
    expect(d.reason).toMatch(/ordinary shares/i);
  });

  it("still calls an IBKR share a share", () => {
    const d = suggestAssetType({
      platform: "ibkr",
      assetClass: "STK",
      coin: "AAPL",
      instrumentName: "Apple Inc",
    });
    expect(d.value).toBe("stock");
  });

  it("never overrules a platform that stated the type outright", () => {
    // Trading 212 publishes ETF and STOCK separately, so its word is fact and
    // the name has nothing to add.
    const d = suggestAssetType({
      platform: "trading212",
      assetClass: "STOCK",
      coin: "X",
      instrumentName: "Something Treasury Bond",
    });
    expect(d.value).toBe("stock");
  });

  it("fills a gap the platform left open", () => {
    const d = suggestAssetType({
      platform: "ibkr",
      assetClass: null,
      coin: "X",
      instrumentName: "Amundi MSCI Emerging Markets UCITS ETF",
    });
    expect(d.value).toBe("etf");
  });

  it("still gives up when neither source knows", () => {
    const d = suggestAssetType({
      platform: "ibkr",
      assetClass: null,
      coin: "X",
      instrumentName: "Some Company Ltd",
    });
    expect(d.value).toBeNull();
  });

  it("works with no name at all, as before", () => {
    expect(suggestAssetType({ platform: "bybit", assetClass: null, coin: "BTC" }).value).toBe(
      "crypto"
    );
  });
});
