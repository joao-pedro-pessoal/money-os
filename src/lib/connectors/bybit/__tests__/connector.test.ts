import { describe, it, expect, vi } from "vitest";
import { createBybitConnector, BYBIT_BASE_URL } from "../index";
import { signRequest } from "../parse";

const WALLET = {
  retCode: 0,
  result: {
    list: [{
      totalEquity: "10000", totalAvailableBalance: "8000", totalInitialMargin: "2000",
      totalPerpUPL: "500", accountType: "UNIFIED",
      coin: [{ coin: "USDT", walletBalance: "9500", usdValue: "9500", locked: "0", equity: "10000" }],
    }],
  },
};

const POSITIONS = {
  retCode: 0,
  result: {
    list: [{
      symbol: "BTCUSDT", side: "Buy", size: "0.5", avgPrice: "60000",
      markPrice: "62000", positionValue: "31000", unrealisedPnl: "1000",
      leverage: "10", liqPrice: "45000", positionIM: "3100",
    }],
    nextPageCursor: "",
  },
};

const EMPTY = { retCode: 0, result: { list: [], nextPageCursor: "" } };

function connectorWith(responder: (url: string) => unknown) {
  const httpGet = vi.fn(async (url: string, _headers: Record<string, string>) => responder(url));
  return {
    connector: createBybitConnector({ apiKey: "TESTKEY123456789", apiSecret: "TESTSECRET" }, httpGet),
    httpGet,
  };
}

const route = (url: string) =>
  url.includes("wallet-balance") ? WALLET : url.includes("category=linear&settleCoin=USDT") ? POSITIONS : EMPTY;

describe("BybitConnector", () => {
  it("signs every request with the documented header set", async () => {
    const { connector, httpGet } = connectorWith(route);
    await connector.getAccountState("");

    const [url, headers] = httpGet.mock.calls[0] as [string, Record<string, string>];
    expect(url).toContain(BYBIT_BASE_URL);
    expect(headers["X-BAPI-API-KEY"]).toBe("TESTKEY123456789");
    expect(headers["X-BAPI-RECV-WINDOW"]).toBe("5000");
    expect(headers["X-BAPI-SIGN"]).toMatch(/^[a-f0-9]{64}$/);

    // The signature must match what the documented recipe produces.
    const expected = signRequest(
      Number(headers["X-BAPI-TIMESTAMP"]),
      "TESTKEY123456789",
      5000,
      "accountType=UNIFIED",
      "TESTSECRET"
    );
    expect(headers["X-BAPI-SIGN"]).toBe(expected);
  });

  it("asks for the unified wallet and both position categories", async () => {
    const { connector, httpGet } = connectorWith(route);
    await connector.getAccountState("");

    const urls = httpGet.mock.calls.map(([u]) => u);
    expect(urls.some((u) => u.includes("/v5/account/wallet-balance?accountType=UNIFIED"))).toBe(true);
    expect(urls.some((u) => u.includes("category=linear&settleCoin=USDT"))).toBe(true);
    expect(urls.some((u) => u.includes("category=linear&settleCoin=USDC"))).toBe(true);
    expect(urls.some((u) => u.includes("category=inverse"))).toBe(true);
  });

  it("never touches an order endpoint", async () => {
    const { connector, httpGet } = connectorWith(route);
    await connector.getAccountState("");
    for (const [url] of httpGet.mock.calls) {
      expect(url).not.toContain("/order");
    }
  });

  it("normalizes equity and positions", async () => {
    const { connector } = connectorWith(route);
    const state = await connector.getAccountState("");

    expect(state.equity).toBe(10000);
    expect(state.withdrawable).toBe(8000);
    expect(state.totalMarginUsed).toBe(2000);
    expect(state.positions).toHaveLength(1);
    expect(state.positions[0].side).toBe("long");
    expect(state.positions[0].liquidationPrice).toBe(45000);
  });

  it("reports no separate spot pool, since equity already contains it", async () => {
    const { connector } = connectorWith(route);
    const state = await connector.getAccountState("");
    expect(state.spotValue).toBe(0);
    expect(state.balances[0].coin).toBe("USDT");
  });

  it("surfaces an authentication failure instead of reporting an empty account", async () => {
    const { connector } = connectorWith(() => ({ retCode: 10003, retMsg: "API key is invalid" }));
    await expect(connector.getAccountState("")).rejects.toThrow(/doesn't recognise/);
  });

  it("rejects a malformed API key before making any request", () => {
    const { connector } = connectorWith(route);
    const bad = connector.validateIdentifier("nope");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/Bybit API key/);
  });

  it("propagates a network failure rather than zeroing the account", async () => {
    const httpGet = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const connector = createBybitConnector({ apiKey: "TESTKEY123456789", apiSecret: "S" }, httpGet);
    await expect(connector.getAccountState("")).rejects.toThrow("socket hang up");
  });
});

describe("Bybit regions", () => {
  it("defaults to the global host, the only one that can authenticate", async () => {
    const httpGet = vi.fn(async (url: string, _h: Record<string, string>) => route(url));
    const connector = createBybitConnector({ apiKey: "K1234567890", apiSecret: "S" }, httpGet);
    await connector.getAccountState("");
    expect(httpGet.mock.calls[0][0]).toContain("https://api.bybit.com");
  });

  it("uses the global host when told to", async () => {
    const httpGet = vi.fn(async (url: string, _h: Record<string, string>) => route(url));
    const connector = createBybitConnector(
      { apiKey: "K1234567890", apiSecret: "S" },
      httpGet,
      "https://api.bybit.com"
    );
    await connector.getAccountState("");
    for (const [url] of httpGet.mock.calls) {
      expect(url).toContain("https://api.bybit.com");
    }
  });

  it("signs identically regardless of host — only the query is signed", async () => {
    // The base URL is not part of the signature, so a key works on whichever
    // host issued it without any change to the signing recipe.
    const calls: Record<string, string>[] = [];
    const capture = vi.fn(async (url: string, headers: Record<string, string>) => {
      calls.push(headers);
      return route(url);
    });

    const other = createBybitConnector(
      { apiKey: "K1234567890", apiSecret: "S" },
      capture,
      "https://api-testnet.bybit.com"
    );
    await other.getAccountState("");
    const expected = signRequest(
      Number(calls[0]["X-BAPI-TIMESTAMP"]),
      "K1234567890",
      5000,
      "accountType=UNIFIED",
      "S"
    );
    expect(calls[0]["X-BAPI-SIGN"]).toBe(expected);
  });
});
