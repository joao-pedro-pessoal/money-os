import { describe, it, expect } from "vitest";
import {
  mexcError,
  isValidApiKey,
  parseAccountBalances,
  parseTickerPrices,
  priceInDollars,
  signQuery,
  buildQuery,
} from "../parse";
import { binanceError } from "../../binance/parse";

/**
 * The one thing MEXC does differently, and the reason this connector is not
 * just Binance's with another base URL.
 */
describe("a MEXC error code is positive", () => {
  const REAL_FAILURES = [
    { code: 700002, msg: "Signature for this request is not valid" },
    { code: 700001, msg: "Api key info invalid" },
    { code: 10072, msg: "Api key info invalid" },
    { code: 401, msg: "Unauthorized" },
  ];

  it("reports every one of them as an error", () => {
    for (const payload of REAL_FAILURES) {
      expect(mexcError(payload), String(payload.code)).toContain(payload.msg);
    }
  });

  /**
   * The whole point, asserted against the neighbouring connector rather than
   * described in a comment. Binance signals failure with a *negative* code, so
   * its test reports "no error" for all of these — the payload would then be
   * parsed for balances, find none, and the account would read as holding
   * nothing. A wrong key would look like an emptied exchange.
   */
  it("is a case Binance's own error test gets wrong in the dangerous direction", () => {
    for (const payload of REAL_FAILURES) {
      expect(binanceError(payload), String(payload.code)).toBeNull();
      expect(mexcError(payload), String(payload.code)).not.toBeNull();
    }
  });

  it("shows what that mistake would have cost: an account reading as empty", () => {
    const refusal = { code: 700002, msg: "Signature for this request is not valid" };
    // What the connector would have gone on to parse, had the error passed.
    expect(parseAccountBalances(refusal)).toEqual([]);
  });

  it("keeps the venue's own words, which are what distinguish the causes", () => {
    // 700002 is a bad signature; 10072 is a bad key. Same remedy shape,
    // completely different thing to check first.
    expect(mexcError({ code: 700002, msg: "Signature for this request is not valid" })).toBe(
      "Signature for this request is not valid (code 700002)"
    );
  });
});

describe("what is not an error", () => {
  it("passes a successful account reply through", () => {
    const ok = { balances: [{ asset: "USDT", free: "10", locked: "0" }] };
    expect(mexcError(ok)).toBeNull();
  });

  /** A few MEXC endpoints answer 200 or 0 on success. Neither is a failure. */
  it("treats the documented success sentinels as success", () => {
    expect(mexcError({ code: 200, msg: "success" })).toBeNull();
    expect(mexcError({ code: 0, msg: "success" })).toBeNull();
  });

  it("has nothing to say about a reply with no code", () => {
    expect(mexcError([{ symbol: "BTCUSDT", price: "60000" }])).toBeNull();
    expect(mexcError(null)).toBeNull();
    expect(mexcError("nonsense")).toBeNull();
  });

  /** A code without a message is not the error shape and must not be guessed at. */
  it("ignores a bare code with no message", () => {
    expect(mexcError({ code: 700002 })).toBeNull();
  });
});

/**
 * MEXC keys are `mx0…` and roughly thirty characters. Binance's check demands
 * forty, so borrowing it would have rejected every valid MEXC key at the form,
 * before the venue ever saw it — a bug that looks like the key being wrong.
 */
describe("the key format is MEXC's, not Binance's", () => {
  const REAL_SHAPE = "mx0vglsgdjM7Vpa1Rr";

  it("accepts a key of MEXC's length", () => {
    expect(isValidApiKey(REAL_SHAPE)).toBe(true);
  });

  it("rejects an empty box and a pasted wallet address", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey("   ")).toBe(false);
    expect(isValidApiKey("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
  });

  it("rejects a value with whitespace in it, which is a paste gone wrong", () => {
    expect(isValidApiKey("mx0vglsgdjM7Vpa1Rr extra")).toBe(false);
  });
});

/**
 * The shared shapes are tested in full against Binance's 24 cases. These
 * assert that MEXC actually reaches them — a re-export that silently dropped a
 * function would leave the connector importing `undefined`.
 */
describe("the shared spot v3 shapes arrive here", () => {
  it("parses balances and drops the zero rows", () => {
    const parsed = parseAccountBalances({
      balances: [
        { asset: "USDT", free: "12.5", locked: "0.5" },
        { asset: "BTC", free: "0", locked: "0" },
      ],
    });
    expect(parsed).toEqual([{ asset: "USDT", total: 13, hold: 0.5 }]);
  });

  it("builds a price map and refuses a zero price", () => {
    const prices = parseTickerPrices([
      { symbol: "BTCUSDT", price: "60000" },
      { symbol: "DEADUSDT", price: "0" },
    ]);
    expect(prices.get("BTCUSDT")).toBe(60000);
    expect(prices.has("DEADUSDT")).toBe(false);
  });

  it("prices by composing a symbol, and returns null rather than inventing one", () => {
    const prices = parseTickerPrices([{ symbol: "BTCUSDT", price: "60000" }]);
    expect(priceInDollars(prices, "BTC")).toBe(60000);
    expect(priceInDollars(prices, "USDT")).toBe(1);
    // Composition can fail to find a price; it cannot produce a wrong one.
    expect(priceInDollars(prices, "NOTLISTED")).toBeNull();
  });

  it("signs the query string it is given", () => {
    const query = buildQuery({ recvWindow: 5000, timestamp: 1578963600000 });
    expect(query).toBe("recvWindow=5000&timestamp=1578963600000");
    expect(signQuery(query, "secret")).toMatch(/^[0-9a-f]{64}$/);
  });
});
