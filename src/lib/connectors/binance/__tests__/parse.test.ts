import { describe, it, expect } from "vitest";
import {
  binanceError,
  parseAccountBalances,
  parseTickerPrices,
  priceInDollars,
  signQuery,
  buildQuery,
  isValidApiKey,
  DOLLAR_QUOTES,
} from "../parse";

/**
 * Signing. A wrong signature is rejected with the same message as a wrong key,
 * so without a real vector the first sign of trouble would be a user being told
 * their credentials are bad when they are fine.
 */
describe("signing", () => {
  /**
   * Binance's own published example, from the REST signature documentation.
   * The only test here that is evidence rather than self-consistency.
   */
  it("reproduces Binance's published example exactly", () => {
    const signature = signQuery(
      "symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559",
      "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j"
    );
    expect(signature).toBe(
      "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71"
    );
  });

  it("is hex and the right length for SHA-256", () => {
    expect(signQuery("timestamp=1", "secret")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes with the query and with the secret", () => {
    const base = signQuery("timestamp=1", "secret");
    expect(signQuery("timestamp=2", "secret")).not.toBe(base);
    expect(signQuery("timestamp=1", "other")).not.toBe(base);
  });
});

/**
 * The query is built once and both signed and sent. A signature over one
 * encoding delivered with another is rejected as an invalid signature, which
 * reads exactly like a wrong key.
 */
describe("the query string", () => {
  it("keeps the order it was given, which is the order it is signed in", () => {
    expect(buildQuery({ recvWindow: 5000, timestamp: 1499827319559 })).toBe(
      "recvWindow=5000&timestamp=1499827319559"
    );
  });

  it("encodes a value that needs it", () => {
    expect(buildQuery({ symbols: '["BTCUSDT"]' })).toBe("symbols=%5B%22BTCUSDT%22%5D");
  });

  it("signs exactly the string it builds", () => {
    const query = buildQuery({ recvWindow: 5000, timestamp: 1499827319559 });
    expect(signQuery(query, "s")).toBe(signQuery("recvWindow=5000&timestamp=1499827319559", "s"));
  });
});

describe("errors", () => {
  it("keeps the venue's own words, because -2015 means three different things", () => {
    expect(
      binanceError({ code: -2015, msg: "Invalid API-key, IP, or permissions for action." })
    ).toBe("Invalid API-key, IP, or permissions for action. (code -2015)");
  });

  it("is null for an ordinary reply", () => {
    expect(binanceError({ balances: [] })).toBeNull();
    expect(binanceError([{ symbol: "BTCUSDT", price: "1" }])).toBeNull();
    expect(binanceError(null)).toBeNull();
  });

  it("does not treat a positive code as a failure", () => {
    expect(binanceError({ code: 200, msg: "ok" })).toBeNull();
  });
});

describe("spot balances", () => {
  const account = (balances: unknown) => ({ balances });

  it("adds free and locked into what is held", () => {
    const b = parseAccountBalances(
      account([{ asset: "BTC", free: "0.4", locked: "0.1" }])
    );
    expect(b).toEqual([{ asset: "BTC", total: 0.5, hold: 0.1 }]);
  });

  /**
   * Binance answers with a row for every asset it has ever listed against the
   * account, nearly all of them zero. Those are genuine measurements of
   * nothing, and keeping them would bury four real holdings in three hundred.
   */
  it("drops the hundreds of zero rows", () => {
    const b = parseAccountBalances(
      account([
        { asset: "BTC", free: "0.5", locked: "0" },
        { asset: "ADA", free: "0.00000000", locked: "0.00000000" },
        { asset: "DOT", free: "0", locked: "0" },
      ])
    );
    expect(b.map((x) => x.asset)).toEqual(["BTC"]);
  });

  it("skips a row it cannot read rather than calling it zero", () => {
    const b = parseAccountBalances(
      account([
        { asset: "BTC", free: "0.5", locked: "0" },
        { asset: "BAD", free: "not-a-number", locked: "also-not" },
      ])
    );
    expect(b.map((x) => x.asset)).toEqual(["BTC"]);
  });

  it("has nothing to report from a reply with no balances in it", () => {
    expect(parseAccountBalances({})).toEqual([]);
    expect(parseAccountBalances(null)).toEqual([]);
  });
});

describe("prices", () => {
  const ticker = [
    { symbol: "BTCUSDT", price: "78616.00" },
    { symbol: "ETHUSDT", price: "2464.56" },
    { symbol: "XYZUSDC", price: "3.50" },
    { symbol: "DEADUSDT", price: "0.00000000" },
    { symbol: "OBSCUREBTC", price: "0.00012" },
  ];
  const prices = parseTickerPrices(ticker);

  it("reads the last price per symbol", () => {
    expect(prices.get("BTCUSDT")).toBe(78616);
  });

  it("refuses a price of zero, which a delisted symbol still answers with", () => {
    expect(prices.has("DEADUSDT")).toBe(false);
  });

  /**
   * The composition rule, verified against the live exchangeInfo: every one of
   * Binance's 3 645 spot symbols satisfies `symbol === baseAsset + quoteAsset`,
   * so building the symbol is exact rather than a guess.
   */
  it("composes the symbol from the asset and a dollar quote", () => {
    expect(priceInDollars(prices, "BTC")).toBe(78616);
    expect(priceInDollars(prices, "ETH")).toBe(2464.56);
  });

  it("falls back through the other dollar-pegged quotes", () => {
    // No XYZUSDT exists; the USDC market prices it just as well.
    expect(priceInDollars(prices, "XYZ")).toBe(3.5);
  });

  it("prices a dollar stablecoin as a dollar", () => {
    for (const quote of DOLLAR_QUOTES) {
      expect(priceInDollars(prices, quote), quote).toBe(1);
    }
  });

  /**
   * Null, not a price chained through bitcoin. Two hops compound two spreads
   * and produce a number that matches nothing the exchange displays, which is
   * worse than an honest absence.
   */
  it("reports an asset with no dollar market as unpriced", () => {
    expect(priceInDollars(prices, "OBSCURE")).toBeNull();
  });

  it("is not case-sensitive about the asset", () => {
    expect(priceInDollars(prices, "btc")).toBe(78616);
  });

  /**
   * The direction that must never be taken. Eight real Binance symbols split
   * two ways against its own quote-asset list — BTCBUSD is (BTC, BUSD) and
   * also parses as (BTCB, USD). Nothing here splits a symbol, and this asserts
   * the lookup is by exact composed name.
   */
  it("never has to split a symbol to know what it prices", () => {
    const ambiguous = parseTickerPrices([{ symbol: "BTCBUSD", price: "99999" }]);

    // BTCBUSD really is BTC quoted in BUSD, and composing finds it: BTC+USDT,
    // +USDC and +FDUSD are absent, BTC+BUSD hits. The right answer.
    expect(priceInDollars(ambiguous, "BTC")).toBe(99999);

    // BTCB is the other reading of that same string, and composing it produces
    // BTCBUSDT, BTCBUSDC, BTCBFDUSD, BTCBBUSD — none of which exist. So it is
    // correctly unpriced. A decomposer looking at "BTCBUSD" would have to pick
    // one of the two readings and would sometimes pick this one.
    expect(priceInDollars(ambiguous, "BTCB")).toBeNull();
  });

  it("has nothing to say about a reply that is not a list", () => {
    expect(parseTickerPrices({}).size).toBe(0);
  });
});

describe("the key itself", () => {
  it("rejects an empty box and a wallet address pasted by mistake", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey("0x1234567890abcdef1234567890abcdef12345678901234")).toBe(false);
  });

  it("accepts something key-shaped", () => {
    expect(isValidApiKey("A".repeat(64))).toBe(true);
  });
});
