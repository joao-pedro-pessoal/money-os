import { describe, expect, it } from "vitest";
import { cleanSymbol, cleanSymbolName, symbolLabel, symbolsToName, SYMBOL_NAME_MAX } from "../symbolNames";

describe("a name for a ticker", () => {
  it("is tidied, and an empty one removes the name", () => {
    expect(cleanSymbolName("  Ouro   físico ")).toBe("Ouro físico");
    expect(cleanSymbolName("   ")).toBeNull();
    expect(() => cleanSymbolName("x".repeat(SYMBOL_NAME_MAX + 1))).toThrow(/at most/);
  });

  it("belongs to a symbol a form could really send", () => {
    expect(cleanSymbol(" IGLAl_EQ ")).toBe("IGLAl_EQ");
    expect(() => cleanSymbol("")).toThrow();
    expect(() => cleanSymbol("A\u0000B")).toThrow();
  });

  it("replaces the symbol where only text fits, and the shortened symbol stands in otherwise", () => {
    const names = { IGLAl_EQ: "Ouro físico" };
    expect(symbolLabel("IGLAl_EQ", names)).toBe("Ouro físico");
    expect(symbolLabel("PHAGa_EQ", names)).toBe("PHAGa");
    expect(symbolLabel("iShares VII plc - iShares Core S&P 500 UCITS ETF USD (Acc)", {})).not.toMatch(/plc|UCITS/);
    expect(symbolLabel(null, names)).toBe("");
  });

  it("is offered for what is held first, then what was traded, then what is watched, each once", () => {
    expect(symbolsToName({ held: ["BTC", "HYPE"], traded: ["ZRO", "HYPE", ""], watched: ["AAPL", "BTC"] })).toEqual([
      { symbol: "BTC", where: "held" },
      { symbol: "HYPE", where: "held" },
      { symbol: "ZRO", where: "traded" },
      { symbol: "AAPL", where: "watched" },
    ]);
  });
});
