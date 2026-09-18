import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSnapTradeConnector } from "..";
import { authQuery, canonicalJson, parseAccounts, parsePositions, signRequest } from "../parse";

/** The official SDK's own serialisation (JSONstringifyOrder), to check ours against. */
function sdkCanonical(obj: unknown): string {
  const allKeys: string[] = [];
  const seen: Record<string, null> = {};
  JSON.stringify(obj, (key, value) => {
    if (!(key in seen)) {
      allKeys.push(key);
      seen[key] = null;
    }
    return value;
  });
  allKeys.sort();
  return JSON.stringify(obj, allKeys);
}

describe("signing", () => {
  it("serialises exactly as the official SDK does", () => {
    const sample = { query: "clientId=ABC&timestamp=1", path: "/accounts", content: { b: 1, a: { d: [1, 2], c: "x" } } };
    expect(canonicalJson(sample)).toBe(sdkCanonical(sample));
    expect(canonicalJson({ content: null, path: "/accounts", query: "q" })).toBe(sdkCanonical({ content: null, path: "/accounts", query: "q" }));
  });

  it("signs {content, path, query} with the consumer key", () => {
    const query = "clientId=ABC&timestamp=1700000000";
    const expected = createHmac("sha256", "secret-key")
      .update(`{"content":null,"path":"/accounts","query":"${query}"}`)
      .digest("base64");
    expect(signRequest("secret-key", "/accounts", query)).toBe(expected);
  });

  it("puts the client id and a timestamp in seconds on the query", () => {
    expect(authQuery("ABC", new Date(1_700_000_000_500))).toBe("clientId=ABC&timestamp=1700000000");
  });
});

describe("parsing", () => {
  it("keeps open real accounts with their stated total", () => {
    const accounts = parseAccounts([
      { id: "a1", name: "ISA", institution_name: "Trading 212", balance: { total: { amount: 1500.5, currency: "eur" } }, is_paper: false },
      { id: "a2", name: "Demo", institution_name: "Alpaca", balance: { total: { amount: 100000, currency: "USD" } }, is_paper: true },
      { id: "a3", name: "Old", institution_name: "X", balance: { total: null }, is_paper: false, status: "closed" },
    ]);
    expect(accounts).toEqual([{ id: "a1", name: "ISA", institution: "Trading 212", total: 1500.5, currency: "EUR" }]);
  });

  it("reads positions, and leaves value and result empty for another currency", () => {
    const positions = parsePositions(
      {
        results: [
          { instrument: { kind: "etf", symbol: "VWCE", description: "Vanguard FTSE All-World" }, units: "10", price: "120", cost_basis: "100", currency: "EUR" },
          { instrument: { kind: "stock", symbol: "AAPL", description: "Apple" }, units: "2", price: "200", cost_basis: "150", currency: "USD" },
          { instrument: { kind: "stock", symbol: "ZERO" }, units: "0", price: "1", currency: "EUR" },
        ],
      },
      "EUR"
    );
    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({ coin: "VWCE", size: 10, positionValue: 1200, unrealizedPnl: 200, assetClass: "etf", instrumentName: "Vanguard FTSE All-World" });
    expect(positions[1]).toMatchObject({ coin: "AAPL", positionValue: null, unrealizedPnl: null, markPrice: 200 });
  });
});

describe("connector", () => {
  const replies: Record<string, unknown> = {
    "/accounts": [{ id: "a1", name: "ISA", institution_name: "Trading 212", balance: { total: { amount: 1300, currency: "EUR" } }, is_paper: false }],
    "/accounts/a1/positions/all": { results: [{ instrument: { kind: "etf", symbol: "VWCE" }, units: "10", price: "120", cost_basis: "100", currency: "EUR" }] },
    "/accounts/a1/balances": [{ currency: { code: "EUR" }, cash: 100 }],
  };

  it("reads every account with signed GETs only, and uses the stated total", async () => {
    const calls: { url: string; signature: string }[] = [];
    const connector = createSnapTradeConnector(
      { clientId: "ABC", consumerKey: "k" },
      async (url, headers) => {
        calls.push({ url, signature: headers.Signature });
        const path = new URL(url).pathname;
        return replies[path];
      },
      "https://api.snaptrade.com",
      () => new Date(1_700_000_000_000)
    );
    const state = await connector.getAccountState("ABC");
    expect(state.currency).toBe("EUR");
    expect(state.equity).toBe(1300);
    expect(state.withdrawable).toBe(100);
    expect(state.balancesAreSeparatePool).toBe(false);
    expect(state.positions[0].coin).toBe("VWCE");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/accounts", "/accounts/a1/positions/all", "/accounts/a1/balances"]);
    expect(calls[0].signature).toBe(signRequest("k", "/accounts", "clientId=ABC&timestamp=1700000000"));
  });

  it("refuses accounts in several currencies rather than adding them", async () => {
    const connector = createSnapTradeConnector({ clientId: "ABC", consumerKey: "k" }, async (url) => {
      const path = new URL(url).pathname;
      if (path === "/accounts") {
        return [
          { id: "a1", institution_name: "A", balance: { total: { amount: 1, currency: "EUR" } } },
          { id: "a2", institution_name: "B", balance: { total: { amount: 1, currency: "USD" } } },
        ];
      }
      return [];
    });
    await expect(connector.getAccountState("ABC")).rejects.toThrow(/several currencies/);
  });
});
