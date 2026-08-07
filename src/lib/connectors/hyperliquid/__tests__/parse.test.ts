import { describe, it, expect } from "vitest";
import {
  parseClearinghouseState,
  parsePosition,
  parseSpotBalances,
  buildSpotPriceMap,
  isValidAddress,
  num,
} from "../parse";

/**
 * Fixture copied from the official Hyperliquid docs response for
 * `clearinghouseState`, so the parser is tested against the real shape.
 */
const DOC_FIXTURE = {
  assetPositions: [
    {
      position: {
        coin: "ETH",
        cumFunding: { allTime: "514.085417", sinceChange: "0.0", sinceOpen: "0.0" },
        entryPx: "2986.3",
        leverage: { rawUsd: "-95.059824", type: "isolated", value: 20 },
        liquidationPx: "2866.26936529",
        marginUsed: "4.967826",
        maxLeverage: 50,
        positionValue: "100.02765",
        returnOnEquity: "-0.0026789",
        szi: "0.0335",
        unrealizedPnl: "-0.0134",
      },
      type: "oneWay",
    },
  ],
  crossMaintenanceMarginUsed: "0.0",
  crossMarginSummary: {
    accountValue: "13104.514502",
    totalMarginUsed: "0.0",
    totalNtlPos: "0.0",
    totalRawUsd: "13104.514502",
  },
  marginSummary: {
    accountValue: "13109.482328",
    totalMarginUsed: "4.967826",
    totalNtlPos: "100.02765",
    totalRawUsd: "13009.454678",
  },
  time: 1708622398623,
  withdrawable: "13104.514502",
};

describe("num", () => {
  it("parses Hyperliquid's stringified numbers", () => {
    expect(num("2986.3")).toBe(2986.3);
    expect(num("-0.0134")).toBe(-0.0134);
  });

  it("returns null rather than NaN for unusable values", () => {
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("not a number")).toBeNull();
  });
});

describe("parseClearinghouseState", () => {
  const state = parseClearinghouseState(DOC_FIXTURE);

  it("reads equity from marginSummary, not crossMarginSummary", () => {
    expect(state.equity).toBe(13109.482328);
  });

  it("reads margin and withdrawable", () => {
    expect(state.withdrawable).toBe(13104.514502);
    expect(state.totalMarginUsed).toBe(4.967826);
    expect(state.totalNotionalPosition).toBe(100.02765);
  });

  it("converts the platform timestamp", () => {
    expect(state.asOf?.getTime()).toBe(1708622398623);
  });

  it("parses the open position", () => {
    expect(state.positions).toHaveLength(1);
    const p = state.positions[0];
    expect(p.coin).toBe("ETH");
    expect(p.side).toBe("long");
    expect(p.size).toBe(0.0335);
    expect(p.entryPrice).toBe(2986.3);
    expect(p.unrealizedPnl).toBe(-0.0134);
    expect(p.leverage).toBe(20);
    expect(p.leverageType).toBe("isolated");
    expect(p.liquidationPrice).toBe(2866.26936529);
    expect(p.cumFunding).toBe(514.085417);
  });

  it("derives mark price from positionValue / size", () => {
    // 100.02765 / 0.0335 = 2985.9
    expect(state.positions[0].markPrice).toBeCloseTo(2985.9, 6);
  });

  it("derives a mark price consistent with the API's own unrealizedPnl", () => {
    // Independent cross-check that the derivation is right:
    // (mark - entry) * size = (2985.9 - 2986.3) * 0.0335 = -0.0134
    const p = state.positions[0];
    const implied = (p.markPrice! - p.entryPrice!) * p.size;
    expect(implied).toBeCloseTo(p.unrealizedPnl!, 6);
  });

  it("throws on a response that isn't a clearinghouse state", () => {
    expect(() => parseClearinghouseState({ foo: "bar" })).toThrow(/marginSummary/);
  });

  it("handles an account with no open positions", () => {
    const empty = parseClearinghouseState({
      assetPositions: [],
      marginSummary: { accountValue: "500.0", totalMarginUsed: "0.0", totalNtlPos: "0.0" },
      withdrawable: "500.0",
      time: 1,
    });
    expect(empty.positions).toEqual([]);
    expect(empty.equity).toBe(500);
  });
});

describe("parsePosition", () => {
  const base = DOC_FIXTURE.assetPositions[0];

  it("marks a negative size as short and reports size as positive", () => {
    const short = parsePosition({ position: { ...base.position, szi: "-2.5" } })!;
    expect(short.side).toBe("short");
    expect(short.size).toBe(2.5);
  });

  it("skips a flat position", () => {
    expect(parsePosition({ position: { ...base.position, szi: "0" } })).toBeNull();
  });

  it("skips malformed entries instead of producing NaN", () => {
    expect(parsePosition({})).toBeNull();
    expect(parsePosition({ position: { szi: "1" } })).toBeNull(); // no coin
  });

  it("tolerates a null entry and liquidation price", () => {
    const p = parsePosition({ position: { ...base.position, entryPx: null, liquidationPx: null } })!;
    expect(p.entryPrice).toBeNull();
    expect(p.liquidationPrice).toBeNull();
  });
});

describe("isValidAddress", () => {
  it("accepts a 42-character hex address", () => {
    expect(isValidAddress("0xb65822a30bbaaa68942d6f4c43d78704faeabbbb")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidAddress("0x123")).toBe(false);
    expect(isValidAddress("b65822a30bbaaa68942d6f4c43d78704faeabbbb")).toBe(false);
    expect(isValidAddress("")).toBe(false);
  });
});

const SPOT_STATE = {
  balances: [
    { coin: "USDC", token: 0, hold: "0.0", total: "14.625485", entryNtl: "0.0" },
    { coin: "PURR", token: 1, hold: "500", total: "2000", entryNtl: "1234.56" },
    { coin: "GHOST", token: 9, hold: "0", total: "10", entryNtl: "0" },
    { coin: "ZERO", token: 8, hold: "0", total: "0", entryNtl: "0" },
  ],
};

const SPOT_META_CTXS = [
  {
    tokens: [
      { name: "USDC", index: 0 },
      { name: "PURR", index: 1 },
      { name: "GHOST", index: 9 },
    ],
    universe: [{ name: "PURR/USDC", tokens: [1, 0], index: 0 }],
  },
  [{ markPx: "0.14", midPx: "0.209265", prevDayPx: "0.20432" }],
];

describe("buildSpotPriceMap", () => {
  it("maps a base token to its USD price via the USDC pair", () => {
    expect(buildSpotPriceMap(SPOT_META_CTXS)).toEqual({ PURR: 0.14 });
  });

  it("returns an empty map for a malformed response instead of throwing", () => {
    expect(buildSpotPriceMap(null)).toEqual({});
    expect(buildSpotPriceMap([{}])).toEqual({});
  });
});

describe("parseSpotBalances", () => {
  const { balances, spotValue } = parseSpotBalances(SPOT_STATE, buildSpotPriceMap(SPOT_META_CTXS));

  it("values stablecoins 1:1 without needing a market", () => {
    const usdc = balances.find((b) => b.coin === "USDC")!;
    expect(usdc.price).toBe(1);
    expect(usdc.usdValue).toBe(14.63);
  });

  it("values other tokens at their market price", () => {
    const purr = balances.find((b) => b.coin === "PURR")!;
    expect(purr.price).toBe(0.14);
    expect(purr.usdValue).toBe(280); // 2000 * 0.14
    expect(purr.hold).toBe(500);
  });

  it("keeps an unpriced token visible with a null value rather than counting it as zero", () => {
    const ghost = balances.find((b) => b.coin === "GHOST")!;
    expect(ghost.price).toBeNull();
    expect(ghost.usdValue).toBeNull();
    expect(ghost.total).toBe(10);
  });

  it("drops zero balances", () => {
    expect(balances.find((b) => b.coin === "ZERO")).toBeUndefined();
  });

  it("sums only what it can price", () => {
    expect(spotValue).toBe(294.63); // 14.63 + 280, GHOST excluded
  });

  it("handles an empty spot account", () => {
    expect(parseSpotBalances({ balances: [] })).toEqual({ balances: [], spotValue: 0 });
  });
});
