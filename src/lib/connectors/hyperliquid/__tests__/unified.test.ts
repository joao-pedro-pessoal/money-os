import { describe, it, expect, vi } from "vitest";
import {
  looksUnified,
  parseAbstraction,
  isUnifiedAbstraction,
  parsePortfolioValue,
  parseSpotBalances,
  parseRealizedPnl,
} from "../parse";
import { createHyperliquidConnector } from "../index";

/**
 * A unified account reports `withdrawable: 0.0`, and it does not mean nothing
 * is free.
 *
 * Every number below was read from the live endpoints. The perps sub-account
 * holds no collateral of its own under this mode — it all sits in spot, marked
 * `hold` — so the venue answers zero to a question about the sub-account. Read
 * as a measurement of the whole balance it declared the entire pot committed:
 * 174.65 of margin against one trade tying up 10.71.
 */
describe("margin and free cash on a unified account", () => {
  const ADDRESS = "0xb65822a30bbaaa68942d6f4c43d78704faeabbbb";

  const live = {
    clearinghouseState: {
      assetPositions: [
        {
          position: {
            coin: "FIL",
            szi: "18.0",
            entryPx: "1.98",
            positionValue: "39.3577",
            unrealizedPnl: "3.7975",
            marginUsed: "10.8893",
            leverage: { type: "cross", value: 5 },
          },
          type: "oneWay",
        },
      ],
      marginSummary: {
        accountValue: "10.708233",
        totalMarginUsed: "10.708233",
        totalNtlPos: "39.3577",
      },
      withdrawable: "0.0",
    },
    spotClearinghouseState: {
      balances: [
        // The collateral never leaves spot: `hold` is exactly the perps margin.
        { coin: "USDC", total: "88.217128", hold: "10.708233" },
        { coin: "HYPE", total: "1.12800902", hold: "0.0" },
      ],
    },
    userAbstraction: "unifiedAccount",
    allMids: { HYPE: "76.461" },
    portfolio: [["day", { accountValueHistory: [[1, "174.65"]] }]],
  } as Record<string, unknown>;

  const connector = () =>
    createHyperliquidConnector(
      vi.fn().mockImplementation(async (_url: string, body: { type: string }) => {
        if (body.type === "spotMetaAndAssetCtxs") return [{ tokens: [], universe: [] }, []];
        if (body.type === "perpDexs") return [];
        return live[body.type] ?? null;
      })
    );

  it("reports the margin the venue reports, not the whole balance", async () => {
    const state = await connector().getAccountState(ADDRESS);
    expect(state.totalMarginUsed).toBeCloseTo(10.71, 2);
  });

  it("does not report zero free when almost everything is free", async () => {
    const state = await connector().getAccountState(ADDRESS);
    // 174.65 in the pot, 10.71 held against the open trade.
    expect(state.withdrawable).toBeCloseTo(163.94, 2);
  });

  it("keeps free plus committed adding back to the account value", async () => {
    // The identity that makes a wrong number impossible to hide.
    const state = await connector().getAccountState(ADDRESS);
    expect(state.withdrawable! + state.totalMarginUsed!).toBeCloseTo(state.equity, 2);
  });
});

/**
 * "+0,00 €" against a holding that is up three euros.
 *
 * Hyperliquid states what a spot balance cost in `entryNtl` and it was
 * discarded at every step — the parser, the schema, the sync and the screen —
 * so the table reported the holding as exactly flat.
 */
describe("what a spot balance cost", () => {
  it("reads the entry the venue states", () => {
    const { balances } = parseSpotBalances(
      { balances: [{ coin: "HYPE", total: "1.12800902", hold: "0.0", entryNtl: "82.62064513" }] },
      {},
      { HYPE: 76.461 }
    );

    expect(balances[0].costBasis).toBeCloseTo(82.62, 2);
    // Up, not flat: about 86.25 against 82.62.
    expect(balances[0].usdValue! - balances[0].costBasis!).toBeGreaterThan(3);
  });

  it("treats an entry of zero as not stated", () => {
    // Hyperliquid writes "0.0" wherever it has no entry, USDC included, and
    // reading that as a real cost reports the whole balance as profit.
    const { balances } = parseSpotBalances(
      { balances: [{ coin: "USDC", total: "88.217128", hold: "0.0", entryNtl: "0.0" }] },
      {},
      {}
    );

    expect(balances[0].costBasis).toBeNull();
  });

  it("says nothing when the field is absent altogether", () => {
    const { balances } = parseSpotBalances(
      { balances: [{ coin: "HYPE", total: "1.128", hold: "0.0" }] },
      {},
      { HYPE: 76.461 }
    );

    expect(balances[0].costBasis).toBeNull();
  });
});

describe("valuing what is held as collateral", () => {
  it("prices the held portion, as a second reading of margin", () => {
    const { heldValue, spotValue } = parseSpotBalances(
      {
        balances: [
          { coin: "USDC", total: "88.217128", hold: "10.708233" },
          { coin: "HYPE", total: "1.12800902", hold: "0.0" },
        ],
      },
      {},
      { HYPE: 76.461 }
    );

    expect(heldValue).toBeCloseTo(10.71, 2);
    expect(spotValue).toBeCloseTo(174.47, 1);
  });

  it("leaves an unpriced coin out of the held total rather than counting it as zero", () => {
    const { heldValue } = parseSpotBalances(
      { balances: [{ coin: "WHAT", total: "5", hold: "5" }] },
      {},
      {}
    );
    // Nothing measured it, so it contributes nothing — and `spotValue` says so
    // too. Counting it as zero held would understate what is committed.
    expect(heldValue).toBe(0);
  });
});

describe("asking the venue whether the account is unified", () => {
  it("reads the documented answers", () => {
    expect(parseAbstraction("unifiedAccount")).toBe("unifiedAccount");
    expect(parseAbstraction("portfolioMargin")).toBe("portfolioMargin");
    expect(parseAbstraction("default")).toBe("default");
  });

  it("reports nothing usable as null, so the caller can fall back", () => {
    expect(parseAbstraction(null)).toBeNull();
    expect(parseAbstraction("")).toBeNull();
    expect(parseAbstraction({ mode: "unifiedAccount" })).toBeNull();
  });

  it("treats unified and portfolio margin as one pot", () => {
    // Hyperliquid's docs group both: under either, the spot balance is the
    // collateral, so adding the perps value on top counts it twice.
    expect(isUnifiedAbstraction("unifiedAccount")).toBe(true);
    expect(isUnifiedAbstraction("portfolioMargin")).toBe(true);
  });

  it("leaves the separated modes alone", () => {
    for (const mode of ["default", "disabled", "dexAbstraction", null]) {
      expect(isUnifiedAbstraction(mode)).toBe(false);
    }
  });
});

describe("reading the venue's own portfolio value", () => {
  const payload = [
    [
      "day",
      {
        accountValueHistory: [
          [1741886630493, "90.10"],
          [1741895270493, "92.49"],
        ],
        pnlHistory: [],
        vlm: "0.0",
      },
    ],
    ["week", { accountValueHistory: [[1741886630493, "80.00"]] }],
  ];

  it("takes the most recent point of the shortest window", () => {
    // 92.49 is the figure the venue's own screen shows, and the number the app
    // used to disagree with by 17 dollars.
    expect(parsePortfolioValue(payload)).toBe(92.49);
  });

  it("falls back to a longer window when the day is empty", () => {
    const noDay = [["day", { accountValueHistory: [] }], ["week", { accountValueHistory: [[1, "77.5"]] }]];
    expect(parsePortfolioValue(noDay)).toBe(77.5);
  });

  it("returns null rather than zero for a shape it doesn't recognise", () => {
    // A zero here would wipe the account's value and look like a real change.
    expect(parsePortfolioValue(null)).toBeNull();
    expect(parsePortfolioValue({})).toBeNull();
    expect(parsePortfolioValue([])).toBeNull();
    expect(parsePortfolioValue([["day", {}]])).toBeNull();
    expect(parsePortfolioValue([["day", { accountValueHistory: [[1, "abc"]] }]])).toBeNull();
  });

  it("keeps a genuine zero balance", () => {
    expect(parsePortfolioValue([["day", { accountValueHistory: [[1, "0.0"]] }]])).toBe(0);
  });
});

describe("the fallback heuristic, for when the endpoint is unreachable", () => {
  it("still recognises the account that exposed the bug", () => {
    // withdrawable 69.46 against a perps pot of 18.03. You cannot withdraw
    // more than a pot holds, so the figure describes something larger.
    expect(looksUnified({ equity: 18.03, withdrawable: 69.46, spotValue: 91.88 })).toBe(true);
  });

  it("leaves a separated account alone", () => {
    expect(looksUnified({ equity: 500, withdrawable: 420, spotValue: 100 })).toBe(false);
  });

  it("is not fooled by an account with nothing open", () => {
    expect(looksUnified({ equity: 250, withdrawable: 250, spotValue: 80 })).toBe(false);
  });

  it("says nothing without a withdrawable figure", () => {
    expect(looksUnified({ equity: 10, withdrawable: null, spotValue: 90 })).toBe(false);
  });
});

/**
 * Closed trades left no trace anywhere in the app.
 *
 * `clearinghouseState` describes open positions only, so forty closed fills
 * showed up as "0.00 sales" on the Realized P&L card. The venue keeps them in
 * `userFills`, which the connector never asked for.
 */
describe("realised P&L from closed fills", () => {
  it("sums what the venue calls closed P&L", () => {
    const fills = [
      { coin: "FIL", closedPnl: "1.973376", fee: "0.007759" },
      { coin: "FIL", closedPnl: "2.622032", fee: "0.01031" },
      { coin: "LIT", closedPnl: "-0.121", fee: "0.006288" },
    ];

    const { realized, fillCount } = parseRealizedPnl(fills);
    expect(realized).toBeCloseTo(4.47, 2);
    expect(fillCount).toBe(3);
  });

  it("keeps fees as their own measurement rather than netting them off", () => {
    // Whether closedPnl is already net of fees is not knowable from the
    // payload, so both are reported and neither pretends to be the other.
    const { realized, fees } = parseRealizedPnl([
      { closedPnl: "10", fee: "0.5" },
      { closedPnl: "0", fee: "0.25" },
    ]);

    expect(realized).toBe(10);
    expect(fees).toBe(0.75);
  });

  it("counts only the fills that closed something", () => {
    // Opening a position produces a fill with closedPnl of zero. Counting it
    // would report trades that never closed.
    const { fillCount } = parseRealizedPnl([
      { closedPnl: "0", fee: "0.1" },
      { closedPnl: "3", fee: "0.1" },
    ]);

    expect(fillCount).toBe(1);
  });

  it("reports nothing read as unknown, never as zero", () => {
    // "You have realised 0.00" and "nobody told us" must not render alike.
    expect(parseRealizedPnl([]).realized).toBeNull();
    expect(parseRealizedPnl(null).realized).toBeNull();
    expect(parseRealizedPnl("nope").realized).toBeNull();
  });

  it("survives a fill whose numbers are unreadable", () => {
    const { realized, fees } = parseRealizedPnl([
      { closedPnl: "abc", fee: null },
      { closedPnl: "2.5", fee: "0.1" },
    ]);

    expect(realized).toBe(2.5);
    expect(fees).toBe(0.1);
  });
});
