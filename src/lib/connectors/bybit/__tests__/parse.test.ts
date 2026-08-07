import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  num, signRequest, buildQuery, unwrap,
  parseWalletBalance, parsePosition, parsePositions, isValidApiKey,
} from "../parse";

/** Copied from the Bybit docs response for /v5/account/wallet-balance. */
const WALLET_FIXTURE = {
  retCode: 0,
  retMsg: "OK",
  result: {
    list: [
      {
        totalEquity: "3.31216591",
        accountIMRate: "0",
        totalMarginBalance: "3.00326056",
        totalInitialMargin: "0",
        accountType: "UNIFIED",
        totalAvailableBalance: "3.00326056",
        totalPerpUPL: "0",
        totalWalletBalance: "3.00326056",
        totalMaintenanceMargin: "0",
        coin: [
          {
            coin: "BTC", equity: "0.5", usdValue: "30000", walletBalance: "0.5",
            locked: "0.1", unrealisedPnl: "0", availableToWithdraw: "0",
          },
          {
            coin: "USDT", equity: "0", usdValue: "0", walletBalance: "0",
            locked: "0", unrealisedPnl: "0",
          },
        ],
      },
    ],
  },
  time: 1690872862481,
};

/** Copied from the Bybit docs response for /v5/position/list. */
const POSITION_FIXTURE = {
  retCode: 0,
  retMsg: "OK",
  result: {
    list: [
      {
        positionIdx: 0, symbol: "BTCUSD", side: "Sell", size: "300",
        avgPrice: "27464.50441675", positionValue: "0.01092319",
        positionStatus: "Normal", leverage: "10", markPrice: "28224.50",
        liqPrice: "", positionIM: "0.00010923", positionMM: "0.0000015",
        unrealisedPnl: "-0.00029413", curRealisedPnl: "0.00013123",
        cumRealisedPnl: "-0.00096902", createdTime: "1676538056258",
      },
    ],
    nextPageCursor: "",
    category: "inverse",
  },
  time: 1697684980172,
};

describe("num", () => {
  it("parses stringified numbers", () => {
    expect(num("27464.50441675")).toBe(27464.50441675);
    expect(num("-0.00029413")).toBe(-0.00029413);
  });

  it('treats Bybit\'s empty string as "not applicable", not zero', () => {
    expect(num("")).toBeNull();
    expect(num(null)).toBeNull();
    expect(num("abc")).toBeNull();
  });
});

describe("signRequest", () => {
  it("signs timestamp + key + recvWindow + query, in that order", () => {
    const expected = createHmac("sha256", "SECRET")
      .update("1672125440406KEY5000accountType=UNIFIED")
      .digest("hex");
    expect(signRequest(1672125440406, "KEY", 5000, "accountType=UNIFIED", "SECRET")).toBe(expected);
  });

  it("produces a different signature when any part changes", () => {
    const base = signRequest(1, "KEY", 5000, "a=1", "SECRET");
    expect(signRequest(2, "KEY", 5000, "a=1", "SECRET")).not.toBe(base);
    expect(signRequest(1, "OTHER", 5000, "a=1", "SECRET")).not.toBe(base);
    expect(signRequest(1, "KEY", 5000, "a=2", "SECRET")).not.toBe(base);
    expect(signRequest(1, "KEY", 5000, "a=1", "OTHER")).not.toBe(base);
  });

  it("is a 64-character hex digest", () => {
    expect(signRequest(1, "K", 5000, "", "S")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("buildQuery", () => {
  it("joins parameters in insertion order, which is what gets signed", () => {
    expect(buildQuery({ category: "linear", settleCoin: "USDT" })).toBe("category=linear&settleCoin=USDT");
  });

  it("drops empty and undefined parameters", () => {
    expect(buildQuery({ a: "1", b: undefined, c: "" })).toBe("a=1");
  });
});

describe("unwrap", () => {
  it("returns the result when retCode is 0", () => {
    expect(unwrap<{ x: number }>({ retCode: 0, result: { x: 1 } })).toEqual({ x: 1 });
  });

  it("throws on a Bybit error rather than treating it as empty data", () => {
    // Bybit answers HTTP 200 for failures; missing this would zero the balance.
    expect(() => unwrap({ retCode: 10003, retMsg: "API key is invalid" })).toThrow(/10003.*invalid/);
  });

  it("throws when the envelope isn't a Bybit response at all", () => {
    expect(() => unwrap({ foo: "bar" })).toThrow(/retCode/);
  });

  it("throws when there is no result", () => {
    expect(() => unwrap({ retCode: 0 })).toThrow(/no result/);
  });
});

describe("parseWalletBalance", () => {
  const state = parseWalletBalance(WALLET_FIXTURE);

  it("reads total equity", () => {
    expect(state.totalEquity).toBe(3.31216591);
  });

  it("reads available balance and margin", () => {
    expect(state.availableBalance).toBe(3.00326056);
    expect(state.totalInitialMargin).toBe(0);
  });

  it("lists non-zero coin balances only", () => {
    expect(state.balances).toHaveLength(1);
    expect(state.balances[0].coin).toBe("BTC");
    expect(state.balances[0].total).toBe(0.5);
    expect(state.balances[0].hold).toBe(0.1);
  });

  it("derives a per-coin price from its USD value", () => {
    expect(state.balances[0].price).toBe(60000); // 30000 / 0.5
  });

  it("reports no separate spot pool — it is already inside equity", () => {
    // Unlike Hyperliquid, a Bybit unified account has one pot.
    expect(state.spotValue).toBe(0);
  });

  it("surfaces an API error instead of returning an empty wallet", () => {
    expect(() => parseWalletBalance({ retCode: 10003, retMsg: "API key is invalid" })).toThrow(/invalid/);
  });

  it("throws when there is no account, rather than reporting zero equity", () => {
    expect(() => parseWalletBalance({ retCode: 0, result: { list: [] } })).toThrow(/no account/);
  });
});

describe("parsePosition", () => {
  const raw = POSITION_FIXTURE.result.list[0];

  it("maps Sell to short and keeps size positive", () => {
    const p = parsePosition(raw)!;
    expect(p.side).toBe("short");
    expect(p.size).toBe(300);
  });

  it("maps Buy to long", () => {
    expect(parsePosition({ ...raw, side: "Buy" })!.side).toBe("long");
  });

  it("reads entry, mark, value and P&L", () => {
    const p = parsePosition(raw)!;
    expect(p.entryPrice).toBe(27464.50441675);
    expect(p.markPrice).toBe(28224.5);
    expect(p.positionValue).toBe(0.01092319);
    expect(p.unrealizedPnl).toBe(-0.00029413);
    expect(p.leverage).toBe(10);
  });

  it("treats an empty liquidation price as none, not as zero", () => {
    // Zero would read as "about to be liquidated", which is alarming and wrong.
    expect(parsePosition(raw)!.liquidationPrice).toBeNull();
  });

  it("keeps a real liquidation price", () => {
    expect(parsePosition({ ...raw, liqPrice: "31000.5" })!.liquidationPrice).toBe(31000.5);
  });

  it("derives return on equity from P&L over initial margin", () => {
    // -0.00029413 / 0.00010923
    expect(parsePosition(raw)!.returnOnEquity).toBeCloseTo(-2.6928, 3);
  });

  it("skips a closed position", () => {
    expect(parsePosition({ ...raw, size: "0" })).toBeNull();
    expect(parsePosition({ ...raw, side: "", size: "0" })).toBeNull();
  });

  it("skips a row with no symbol", () => {
    expect(parsePosition({})).toBeNull();
  });
});

describe("parsePositions", () => {
  it("parses the documented list", () => {
    const positions = parsePositions(POSITION_FIXTURE);
    expect(positions).toHaveLength(1);
    expect(positions[0].coin).toBe("BTCUSD");
  });

  it("returns an empty list when there are no positions", () => {
    expect(parsePositions({ retCode: 0, result: { list: [] } })).toEqual([]);
  });

  it("propagates an API error", () => {
    expect(() => parsePositions({ retCode: 10004, retMsg: "error sign" })).toThrow(/10004/);
  });
});

describe("isValidApiKey", () => {
  it("accepts a normal-looking key", () => {
    expect(isValidApiKey("XXXXXXXXXXXXXXXXXXXX")).toBe(true);
  });

  it("rejects something obviously wrong", () => {
    expect(isValidApiKey("short")).toBe(false);
    expect(isValidApiKey("has spaces in it")).toBe(false);
    expect(isValidApiKey("")).toBe(false);
  });
});
