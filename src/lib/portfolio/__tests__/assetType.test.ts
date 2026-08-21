import { describe, it, expect } from "vitest";
import {
  detectIbkr,
  detectHyperliquid,
  suggestAssetType,
  assetTypeOnSync,
} from "../assetType";

describe("detectIbkr", () => {
  it.each([
    ["STK", "stock"],
    ["FUND", "etf"],
    ["BOND", "bond"],
    ["CASH", "cash"],
    ["CRYPTO", "crypto"],
  ])("maps %s to %s", (cls, expected) => {
    expect(detectIbkr(cls).value).toBe(expected);
  });

  it.each(["OPT", "FUT", "FOP", "CFD", "WAR", "IND"])("files %s as other", (cls) => {
    // Certainly not a stock, bond or ETF — "other" is knowledge, not a shrug.
    expect(detectIbkr(cls).value).toBe("other");
  });

  it("is case- and space-insensitive", () => {
    expect(detectIbkr(" stk ").value).toBe("stock");
  });

  it("says nothing when IBKR says nothing", () => {
    expect(detectIbkr(null).value).toBeNull();
    expect(detectIbkr("").value).toBeNull();
  });

  it("names an unrecognised class instead of defaulting", () => {
    const d = detectIbkr("MYSTERY");
    expect(d.value).toBeNull();
    expect(d.reason).toContain("MYSTERY");
  });

  it("warns that ETFs also arrive as STK", () => {
    // The one place this mapping is knowingly imperfect, so it says so.
    expect(detectIbkr("STK").reason).toContain("ETF");
  });
});

describe("detectHyperliquid", () => {
  it("calls a main-market perp crypto", () => {
    expect(detectHyperliquid("BTC").value).toBe("crypto");
    expect(detectHyperliquid("ETH").value).toBe("crypto");
  });

  it("classifies a HIP-3 market by what it tracks", () => {
    // A perpetual is a wrapper, not an asset class. What matters for risk is
    // that these move with gold and silver, not with crypto.
    expect(detectHyperliquid("xyz:GOLD").value).toBe("commodity");
    expect(detectHyperliquid("xyz:SILVER").value).toBe("commodity");
    expect(detectHyperliquid("abc:SPX").value).toBe("index");
  });

  it("says what the market tracks", () => {
    expect(detectHyperliquid("xyz:GOLD").reason).toContain("gold");
  });

  it("still refuses to guess a name it doesn't know", () => {
    const d = detectHyperliquid("xyz:MYSTERYTHING");
    expect(d.value).toBeNull();
    expect(d.reason).toContain("HIP-3");
  });

  it("reads the underlying whatever the prefix", () => {
    expect(detectHyperliquid("anydex:GOLD").value).toBe("commodity");
    expect(detectHyperliquid("GOLD").value).toBe("commodity");
  });
});

describe("suggestAssetType", () => {
  it("uses the asset class for IBKR", () => {
    expect(suggestAssetType({ platform: "ibkr", assetClass: "STK", coin: "CCI" }).value).toBe("stock");
  });

  it("uses the symbol for Hyperliquid, not the class", () => {
    // Every Hyperliquid position arrives as "PERP", so the class says nothing.
    // The coin is what settles it — and it settles differently for each.
    expect(
      suggestAssetType({ platform: "hyperliquid", assetClass: "PERP", coin: "xyz:GOLD" }).value
    ).toBe("commodity");
    expect(
      suggestAssetType({ platform: "hyperliquid", assetClass: "PERP", coin: "BTC" }).value
    ).toBe("crypto");
    expect(
      suggestAssetType({ platform: "hyperliquid", assetClass: "PERP", coin: "xyz:WHOKNOWS" }).value
    ).toBeNull();
  });

  it("calls everything on Bybit crypto", () => {
    expect(suggestAssetType({ platform: "bybit", assetClass: "CRYPTO", coin: "BTCUSDT" }).value).toBe(
      "crypto"
    );
  });

  it("says nothing about a platform it doesn't know", () => {
    expect(suggestAssetType({ platform: "acme", assetClass: "STK", coin: "X" }).value).toBeNull();
  });
});

describe("assetTypeOnSync", () => {
  const stock = { value: "stock" as const, reason: "" };

  it("fills in a blank", () => {
    expect(
      assetTypeOnSync({ existing: null, existingWasAuto: true, suggestion: stock })
    ).toEqual({ value: "stock", auto: true });
  });

  it("never overwrites a choice you made", () => {
    // The same promise the risk tags already make: re-syncing must not undo
    // your tagging.
    expect(
      assetTypeOnSync({ existing: "etf", existingWasAuto: false, suggestion: stock })
    ).toBeNull();
  });

  it("corrects its own earlier guess", () => {
    expect(
      assetTypeOnSync({ existing: "other", existingWasAuto: true, suggestion: stock })
    ).toEqual({ value: "stock", auto: true });
  });

  it("does nothing when the guess hasn't changed", () => {
    expect(
      assetTypeOnSync({ existing: "stock", existingWasAuto: true, suggestion: stock })
    ).toBeNull();
  });

  it("leaves a blank blank when it has no suggestion", () => {
    expect(
      assetTypeOnSync({
        existing: null,
        existingWasAuto: true,
        suggestion: { value: null, reason: "" },
      })
    ).toBeNull();
  });

  it("keeps your choice even when it has no suggestion", () => {
    expect(
      assetTypeOnSync({
        existing: "bond",
        existingWasAuto: false,
        suggestion: { value: null, reason: "" },
      })
    ).toBeNull();
  });

  it("survives the round trip: auto, then edited, then synced again", () => {
    const first = assetTypeOnSync({ existing: null, existingWasAuto: true, suggestion: stock });
    expect(first).toEqual({ value: "stock", auto: true });

    // The user corrects it to an ETF, which sets auto to false.
    const afterEdit = assetTypeOnSync({
      existing: "etf",
      existingWasAuto: false,
      suggestion: stock,
    });
    expect(afterEdit).toBeNull();
  });
});
