import { describe, expect, it } from "vitest";
import {
  coinCode,
  coinIconUrl,
  holdingLogoSymbol,
  initial,
  isCoin,
  isinLogoUrl,
  logoDataUri,
  logoUrl,
  MAX_LOGO_BYTES,
} from "../index";

const png = (length: number) => new Uint8Array(length).fill(1);

describe("where to ask for a mark", () => {
  it("asks by the listing, suffix and all", () => {
    expect(logoUrl("NVDA")).toBe("https://assets.parqet.com/logos/symbol/NVDA");
    expect(logoUrl("SXR8.DE")).toBe("https://assets.parqet.com/logos/symbol/SXR8.DE");
    expect(logoUrl(" VNA.DE ")).toBe("https://assets.parqet.com/logos/symbol/VNA.DE");
  });

  /**
   * A statement writes a fund's legal name where the listing belongs. Asking
   * about it can only fail, and doing so for every row of a table is a few
   * hundred requests that were never going to answer.
   */
  it("does not ask about a name", () => {
    expect(logoUrl("iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc)")).toBeNull();
    expect(logoUrl("DIVIDEND 15 SPLIT A CD 15")).toBeNull();
    expect(logoUrl("")).toBeNull();
    expect(logoUrl(null)).toBeNull();
  });

  it("asks by ISIN for a fund, and only for something shaped like one", () => {
    expect(isinLogoUrl("IE00B5BMR087")).toBe("https://assets.parqet.com/logos/isin/IE00B5BMR087");
    expect(isinLogoUrl("ie00b5bmr087")).toBe("https://assets.parqet.com/logos/isin/IE00B5BMR087");
    expect(isinLogoUrl("SXR8.DE")).toBeNull();
    expect(isinLogoUrl(null)).toBeNull();
  });
});

describe("the coin behind a pair", () => {
  it("drops the currency it is priced in", () => {
    expect(coinCode("BTC-EUR")).toBe("BTC");
    expect(coinCode("BTC-USD")).toBe("BTC");
    expect(coinCode("HYPE")).toBe("HYPE");
    expect(coinCode("usdc")).toBe("USDC");
  });

  it("says nothing for what is not a coin", () => {
    expect(coinCode("xyz:GOLD")).toBeNull();
    expect(coinCode("")).toBeNull();
    expect(coinCode(null)).toBeNull();
  });
});

describe("a coin's own site", () => {
  it("is asked for only where the site was checked by hand", () => {
    expect(coinIconUrl("HYPE")).toBe("https://www.google.com/s2/favicons?domain=hyperliquid.xyz&sz=64");
    expect(coinIconUrl("btc-eur")).toBe("https://www.google.com/s2/favicons?domain=bitcoin.org&sz=64");
    expect(coinIconUrl("NOSUCHCOIN")).toBeNull();
    expect(coinIconUrl(null)).toBeNull();
  });

  /**
   * The guard that keeps this from drawing a coin's mark on a company. There
   * are companies listed as LINK and as ATOM; only the position's own kind
   * says which of the two a symbol is, so the caller has to ask.
   */
  it("is only for what the position says is a coin", () => {
    expect(isCoin("crypto")).toBe(true);
    expect(isCoin("stablecoin")).toBe(true);
    expect(isCoin("staking")).toBe(true);
    expect(isCoin("stock")).toBe(false);
    expect(isCoin("etf")).toBe(false);
    expect(isCoin(null)).toBe(false);
  });
});

describe("which mark a position is drawn with", () => {
  /** Every one of these is a real row: a fund named in full, a coin, a ticker. */
  it("prefers the listing to the name", () => {
    expect(
      holdingLogoSymbol({
        assetType: "etf",
        listing: "SXR8.DE",
        symbol: "iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc)",
      })
    ).toBe("SXR8.DE");
    expect(holdingLogoSymbol({ assetType: "stock", listing: "641.F", symbol: "DIVIDEND 15 SPLIT A CD 15" })).toBe(
      "641.F"
    );
  });

  /**
   * A synced position arrives under the venue's own spelling. Reading it is
   * `yahooSymbolFor`'s job and this must not have a second opinion: six real
   * positions here are Trading 212's, and every one of them was asked about
   * under a name no logo service has ever heard of.
   */
  it("reads a venue's own spelling the way the rest of the app does", () => {
    expect(holdingLogoSymbol({ assetType: "etf", listing: null, symbol: "PHAGa_EQ" })).toBe("PHAG.AS");
    expect(holdingLogoSymbol({ assetType: "stock", listing: null, symbol: "AAPL_US_EQ" })).toBe("AAPL");
  });

  it("asks about the coin, however the pair is spelled", () => {
    expect(holdingLogoSymbol({ assetType: "crypto", listing: "BTC-EUR", symbol: "Bitcoin" })).toBe("BTC");
    expect(holdingLogoSymbol({ assetType: "crypto", listing: null, symbol: "HYPE" })).toBe("HYPE");
    expect(holdingLogoSymbol({ assetType: "stablecoin", listing: null, symbol: "USDC" })).toBe("USDC");
  });

  it("has nothing to ask about for a name alone", () => {
    expect(holdingLogoSymbol({ assetType: "real_estate", listing: null, symbol: "Flat in Porto" })).toBeNull();
    expect(holdingLogoSymbol({ assetType: "commodity", listing: null, symbol: "xyz:GOLD" })).toBeNull();
  });
});

describe("what is kept as a mark", () => {
  it("keeps an image, with its type", () => {
    expect(logoDataUri("image/png", png(4))).toBe("data:image/png;base64,AQEBAQ==");
    expect(logoDataUri("image/svg+xml; charset=utf-8", new TextEncoder().encode("<svg/>"))).toBe(
      "data:image/svg+xml;base64,PHN2Zy8+"
    );
  });

  it("refuses what is not an image", () => {
    expect(logoDataUri("text/html", new TextEncoder().encode("<!doctype html>"))).toBeNull();
    expect(logoDataUri(null, png(4))).toBeNull();
  });

  /** Nothing here can redraw an image, so the only choice about a huge one is to keep it or not. */
  it("refuses an empty answer and an oversized one", () => {
    expect(logoDataUri("image/png", png(0))).toBeNull();
    expect(logoDataUri("image/png", png(MAX_LOGO_BYTES + 1))).toBeNull();
    expect(logoDataUri("image/png", png(MAX_LOGO_BYTES))).not.toBeNull();
  });

  /**
   * An `<img>` neither runs a script nor fetches anything, which is why marks
   * are drawn that way. This refuses one anyway: the next person to read this
   * code should not have to know that rule for it to hold.
   */
  it("refuses an SVG that carries behaviour", () => {
    const svg = (body: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
    expect(logoDataUri("image/svg+xml", svg("<script>alert(1)</script>"))).toBeNull();
    expect(logoDataUri("image/svg+xml", svg('<rect onload="x()"/>'))).toBeNull();
    expect(logoDataUri("image/svg+xml", svg("<foreignObject/>"))).toBeNull();
    expect(logoDataUri("image/svg+xml", svg('<path d="M0 0"/>'))).not.toBeNull();
  });
});

describe("what is drawn where there is no mark", () => {
  it("is the name's own first letter", () => {
    expect(initial("NVIDIA Corporation")).toBe("N");
    expect(initial("  vonovia se")).toBe("V");
    expect(initial("3M Co")).toBe("3");
    expect(initial("Éclair SA")).toBe("É");
  });

  it("falls back to a mark that is plainly not a letter", () => {
    expect(initial("")).toBe("·");
    expect(initial(null)).toBe("·");
    expect(initial("—")).toBe("·");
  });
});
