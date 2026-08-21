import { describe, it, expect } from "vitest";
import { parseAllMids, parseSpotBalances, buildSpotPriceMap } from "../parse";
import { isCurrencyCode } from "@/lib/fx";

/**
 * A balance you hold and a price of zero cannot both be true.
 *
 * HYPE showed as "0,00 US$" against a real holding of 1.128 tokens. The spot
 * metadata only prices tokens that have a pair quoted in a dollar stablecoin,
 * and HYPE trades mainly as a perp — so it had a mark price all day and no
 * entry in the map the app was reading.
 */
describe("pricing a spot balance", () => {
  const heldHype = {
    balances: [
      { coin: "HYPE", total: "1.12800902", hold: "0" },
      { coin: "USDC", total: "88.577582", hold: "10.340633" },
    ],
  };

  it("falls back to the venue-wide mid when the spot map has no pair", () => {
    const { balances } = parseSpotBalances(heldHype, {}, { HYPE: 44.5 });
    const hype = balances.find((b) => b.coin === "HYPE")!;

    expect(hype.price).toBe(44.5);
    expect(hype.usdValue).toBeCloseTo(50.2, 1);
  });

  it("prefers the spot pair when both know the coin", () => {
    // The spot pair is the price of the thing actually held; the perp mid is a
    // near neighbour, good enough to use and not good enough to prefer.
    const { balances } = parseSpotBalances(heldHype, { HYPE: 44.0 }, { HYPE: 44.5 });

    expect(balances.find((b) => b.coin === "HYPE")!.price).toBe(44.0);
  });

  it("says unpriced rather than zero when nothing knows the coin", () => {
    const { balances } = parseSpotBalances(heldHype, {}, {});
    const hype = balances.find((b) => b.coin === "HYPE")!;

    expect(hype.price).toBeNull();
    expect(hype.usdValue).toBeNull();
  });

  it("treats a price of zero as no price at all", () => {
    // Whatever produced the zero, it is not a claim the app should repeat.
    const { balances } = parseSpotBalances(heldHype, { HYPE: 0 }, {});

    expect(balances.find((b) => b.coin === "HYPE")!.price).toBeNull();
  });

  it("leaves the dollar-pegged coins alone", () => {
    const { balances, spotValue } = parseSpotBalances(heldHype, {}, { HYPE: 44.5 });
    const usdc = balances.find((b) => b.coin === "USDC")!;

    expect(usdc.price).toBe(1);
    expect(usdc.usdValue).toBeCloseTo(88.58, 2);
    // The whole point: spot is worth both coins, not just the one with a pair.
    expect(spotValue).toBeGreaterThan(130);
  });
});

describe("reading allMids", () => {
  it("takes the coins and skips the pair indices", () => {
    // "@107" is a spot pair index, meaningless without the universe to resolve
    // it — and the spot map already covers everything it would name.
    const mids = parseAllMids({ HYPE: "44.5", BTC: "98000.0", "@107": "1.0002" });

    expect(mids).toEqual({ HYPE: 44.5, BTC: 98000 });
  });

  it("refuses zero, negative and unreadable prices", () => {
    expect(parseAllMids({ A: "0", B: "-3", C: "abc", D: null })).toEqual({});
  });

  it("refuses a dead pair's zero and keeps the live one", () => {
    /**
     * Two pairs name the same base token — HYPE quotes against several dollar
     * stablecoins — and a pair that has never traded reports a mark of zero.
     * The live price must win regardless of which is listed first.
     */
    const meta = {
      tokens: [
        { name: "HYPE", index: 0 },
        { name: "USDC", index: 1 },
        { name: "USDE", index: 2 },
      ],
      universe: [
        { tokens: [0, 1], index: 10, name: "@10" },
        { tokens: [0, 2], index: 11, name: "@11" },
      ],
    };

    expect(
      buildSpotPriceMap([meta, [{ coin: "@10", markPx: "44.5" }, { coin: "@11", markPx: "0.0" }]])
    ).toEqual({ HYPE: 44.5 });

    // And the same the other way round, where the dead pair is listed first.
    expect(
      buildSpotPriceMap([meta, [{ coin: "@10", markPx: "0.0" }, { coin: "@11", markPx: "44.5" }]])
    ).toEqual({ HYPE: 44.5 });
  });

  /**
   * The defect that made HYPE wrong twice, in the shape the live API returns.
   *
   * `universe` and the contexts are different lengths and different orders, so
   * contexts[i] is not the context for universe[i]. Reading them positionally
   * valued a HYPE balance at 0.092721 — the price of an unrelated token — when
   * the pair's own context said 76.51.
   */
  it("matches a pair to its own context, not to the one in the same position", () => {
    const meta = {
      tokens: [
        { name: "HYPE", index: 150 },
        { name: "USDC", index: 0 },
        { name: "OTHER", index: 9 },
      ],
      universe: [
        // Position 0 in the universe, but the pair is @107.
        { tokens: [150, 0], index: 107, name: "@107" },
      ],
    };

    // Position 0 in the contexts belongs to a different pair entirely.
    const ctxs = [
      { coin: "@105", markPx: "0.092721" },
      { coin: "@106", markPx: "3.0" },
      { coin: "@107", markPx: "76.509" },
    ];

    expect(buildSpotPriceMap([meta, ctxs])).toEqual({ HYPE: 76.509 });
  });

  it("leaves a token unpriced rather than guessing when no context names its pair", () => {
    // Better unpriced than priced from whatever sat at the same index.
    const meta = {
      tokens: [
        { name: "HYPE", index: 150 },
        { name: "USDC", index: 0 },
      ],
      universe: [{ tokens: [150, 0], index: 107, name: "@107" }],
    };

    expect(buildSpotPriceMap([meta, [{ markPx: "0.092721" }]])).toEqual({});
  });

  it("handles the one canonical pair, which is named rather than numbered", () => {
    const meta = {
      tokens: [
        { name: "PURR", index: 1 },
        { name: "USDC", index: 0 },
      ],
      universe: [{ tokens: [1, 0], index: 0, name: "PURR/USDC" }],
    };

    expect(buildSpotPriceMap([meta, [{ coin: "PURR/USDC", markPx: "0.096142" }]])).toEqual({
      PURR: 0.096142,
    });
  });

  it("survives a response that is not what was expected", () => {
    expect(parseAllMids(null)).toEqual({});
    expect(parseAllMids("nope")).toEqual({});
    expect(buildSpotPriceMap(null)).toEqual({});
  });
});

/**
 * 1.75 EUR at a dollar-reporting broker is 1.75 euros.
 *
 * It was displayed as "1,75 US$" — a real amount of the wrong money — because
 * the currency was taken from the platform. The euro at Trading 212 looked
 * right only because that platform happens to report in euros.
 */
describe("telling cash from an asset", () => {
  it("knows the currencies a broker holds cash in", () => {
    for (const code of ["EUR", "USD", "GBP", "CHF", "CAD", "JPY", "BRL"]) {
      expect(isCurrencyCode(code)).toBe(true);
    }
    expect(isCurrencyCode(" eur ")).toBe(true);
  });

  it("does not mistake a token for money", () => {
    for (const code of ["BTC", "ETH", "HYPE", "SOL"]) {
      expect(isCurrencyCode(code)).toBe(false);
    }
  });

  it("leaves stablecoins as assets", () => {
    // USDC is worth about a dollar because a peg holds, which is a fact about
    // a holding rather than a fact about money.
    expect(isCurrencyCode("USDC")).toBe(false);
    expect(isCurrencyCode("USDT")).toBe(false);
    expect(isCurrencyCode("EURC")).toBe(false);
  });

  it("decides nothing about nothing", () => {
    expect(isCurrencyCode(null)).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
  });
});
