import { describe, it, expect } from "vitest";
import {
  krakenError,
  krakenResult,
  normaliseAsset,
  parseBalances,
  parseTradeBalance,
  parseAssetPairs,
  pairFor,
  parseTickerPrices,
  isValidApiKey,
  signRequest,
} from "../parse";

const ok = (result: unknown) => ({ error: [], result });

/**
 * The failure that matters most on this API: it arrives looking like success.
 *
 * Kraken answers a bad key with HTTP 200 and an error array. Anything checking
 * only the status reads an empty result — so a wrong credential renders as an
 * account that holds nothing, which is a number, and an alarming one.
 */
describe("an error that arrives with HTTP 200", () => {
  it("is found rather than read as an empty account", () => {
    const reply = { error: ["EAPI:Invalid key"], result: {} };
    expect(krakenError(reply)).toBe("EAPI:Invalid key");
    expect(parseBalances(reply)).toEqual([]);
    expect(krakenResult(reply)).toBeNull();
  });

  it("keeps the venue's own words, so the message can be acted on", () => {
    expect(krakenError({ error: ["EGeneral:Permission denied"] })).toBe(
      "EGeneral:Permission denied"
    );
  });

  it("joins several errors rather than reporting only the first", () => {
    expect(krakenError({ error: ["EAPI:Rate limit exceeded", "EService:Unavailable"] })).toBe(
      "EAPI:Rate limit exceeded; EService:Unavailable"
    );
  });

  it("treats an empty error array as success, which is what it is", () => {
    expect(krakenError(ok({}))).toBeNull();
  });

  it("refuses a reply that is not an object at all", () => {
    expect(krakenError("<html>502 Bad Gateway</html>")).not.toBeNull();
    expect(krakenError(null)).not.toBeNull();
  });
});

/**
 * Asset codes are not tickers. The X and Z prefixes are a legacy scheme Kraken
 * stopped applying years ago, so the rule cannot be "strip the first letter".
 */
describe("asset codes", () => {
  it("translates the legacy four-character codes", () => {
    expect(normaliseAsset("XXBT").symbol).toBe("BTC");
    expect(normaliseAsset("ZEUR").symbol).toBe("EUR");
    expect(normaliseAsset("XETH").symbol).toBe("ETH");
    expect(normaliseAsset("ZUSD").symbol).toBe("USD");
    expect(normaliseAsset("XXDG").symbol).toBe("DOGE");
  });

  it("leaves a modern code alone", () => {
    expect(normaliseAsset("SOL").symbol).toBe("SOL");
    expect(normaliseAsset("ADA").symbol).toBe("ADA");
    expect(normaliseAsset("USDC").symbol).toBe("USDC");
  });

  /**
   * The case a naive prefix rule destroys. XTZ is Tezos — a real code that
   * begins with X and is not prefixed. "Drop the leading X from a
   * four-character code" would turn it into TZ, which is nothing.
   */
  it("does not maul a code that merely starts with X or Z", () => {
    expect(normaliseAsset("XTZ").symbol).toBe("XTZ");
    expect(normaliseAsset("ZRX").symbol).toBe("ZRX");
  });

  it("reads a staked or earning holding as the asset it is", () => {
    expect(normaliseAsset("DOT.S")).toEqual({ raw: "DOT.S", symbol: "DOT", earning: true });
    expect(normaliseAsset("USDT.F")).toEqual({ raw: "USDT.F", symbol: "USDT", earning: true });
    expect(normaliseAsset("ETH2.S").symbol).toBe("ETH");
  });

  it("keeps the code exactly as it arrived, for looking things up with", () => {
    expect(normaliseAsset("XXBT").raw).toBe("XXBT");
  });

  it("marks a free holding as not earning", () => {
    expect(normaliseAsset("SOL").earning).toBe(false);
  });
});

describe("balances", () => {
  it("reads the plain Balance shape", () => {
    const balances = parseBalances(ok({ XXBT: "0.5", ZEUR: "1200.00" }));
    expect(balances.map((b) => [b.asset.symbol, b.total])).toEqual([
      ["BTC", 0.5],
      ["EUR", 1200],
    ]);
  });

  it("reads the BalanceEx shape, which also states what is on hold", () => {
    const balances = parseBalances(
      ok({ XXBT: { balance: "0.5", hold_trade: "0.1" }, SOL: { balance: "12", hold_trade: "0" } })
    );
    expect(balances.find((b) => b.asset.symbol === "BTC")).toMatchObject({ total: 0.5, hold: 0.1 });
    expect(balances.find((b) => b.asset.symbol === "SOL")).toMatchObject({ total: 12, hold: 0 });
  });

  it("accepts a reply that mixes the two shapes", () => {
    const balances = parseBalances(ok({ XXBT: { balance: "0.5" }, SOL: "12" }));
    expect(balances).toHaveLength(2);
  });

  /**
   * Kraken keeps a row for every asset ever touched, so an account of four
   * holdings answers with sixty lines of "0.0000000000". Those are genuinely
   * zero — the venue measured and found nothing — which is why dropping them
   * is honest here and would not be for a price.
   */
  it("drops the zero rows Kraken keeps for every asset ever touched", () => {
    const balances = parseBalances(
      ok({ XXBT: "0.5", ADA: "0.0000000000", DOT: "0", XLTC: "0.00" })
    );
    expect(balances.map((b) => b.asset.symbol)).toEqual(["BTC"]);
  });

  it("has nothing to report when the reply carried an error", () => {
    expect(parseBalances({ error: ["EAPI:Invalid key"], result: { XXBT: "0.5" } })).toEqual([]);
  });

  it("skips a row it cannot read rather than calling it zero", () => {
    const balances = parseBalances(ok({ XXBT: "0.5", BAD: "not-a-number" }));
    expect(balances.map((b) => b.asset.symbol)).toEqual(["BTC"]);
  });
});

describe("trade balance", () => {
  it("reads equity, free margin and margin used by name", () => {
    const t = parseTradeBalance(ok({ eb: "5000.0", tb: "4800.0", m: "120.5", e: "4900.0", mf: "4779.5" }))!;
    expect(t.equity).toBe(4900);
    expect(t.marginUsed).toBe(120.5);
    expect(t.free).toBe(4779.5);
  });

  /**
   * An account that has never traded on margin has no margin figures. Null is
   * "the venue did not say"; zero would be "nothing is committed", and only
   * one of those is a measurement.
   */
  it("reports a missing margin figure as unknown, not as nothing committed", () => {
    const t = parseTradeBalance(ok({ e: "100.0" }))!;
    expect(t.equity).toBe(100);
    expect(t.marginUsed).toBeNull();
    expect(t.free).toBeNull();
  });

  it("is null when the reply carried an error", () => {
    expect(parseTradeBalance({ error: ["EService:Unavailable"] })).toBeNull();
  });
});

describe("pairs and prices", () => {
  const pairsReply = ok({
    XXBTZUSD: { base: "XXBT", quote: "ZUSD" },
    XXBTZEUR: { base: "XXBT", quote: "ZEUR" },
    SOLUSD: { base: "SOL", quote: "ZUSD" },
  });

  it("reads base and quote as ordinary tickers", () => {
    const pairs = parseAssetPairs(pairsReply);
    expect(pairs.find((p) => p.name === "XXBTZUSD")).toEqual({
      name: "XXBTZUSD",
      base: "BTC",
      quote: "USD",
    });
  });

  it("finds the pair that prices an asset in a currency", () => {
    const pairs = parseAssetPairs(pairsReply);
    expect(pairFor(pairs, "BTC", "USD")).toBe("XXBTZUSD");
    expect(pairFor(pairs, "BTC", "EUR")).toBe("XXBTZEUR");
  });

  /**
   * Null, not a constructed name. "BTC against USD must be XXBTZUSD" is a
   * guess that is right today; an asset with no listed pair stays unpriced and
   * the screen says so.
   */
  it("returns null for an asset with no listed pair", () => {
    expect(pairFor(parseAssetPairs(pairsReply), "DOGE", "USD")).toBeNull();
  });

  /**
   * The case that proves the pair name must be asked for and never built.
   *
   * Dogecoin's asset code is `XXDG` and its dollar pair is named `XDGUSD` —
   * not `XXDGZUSD`, which does not exist. Confirmed against the live
   * AssetPairs response. Anything constructing a pair name out of two asset
   * codes gets nothing back for this coin and, because a missing price is
   * indistinguishable from an unlisted asset, would simply report it unpriced
   * for ever without anyone knowing why.
   */
  it("finds a pair whose name is not its asset codes joined together", () => {
    const pairs = parseAssetPairs(ok({ XDGUSD: { base: "XXDG", quote: "ZUSD" } }));
    expect(pairFor(pairs, "DOGE", "USD")).toBe("XDGUSD");
  });

  it("takes the last-trade price", () => {
    const prices = parseTickerPrices(ok({ XXBTZUSD: { c: ["64000.5", "0.01"] } }));
    expect(prices.get("XXBTZUSD")).toBe(64000.5);
  });

  /**
   * The rule the Hyperliquid contexts taught, in a different costume: Kraken
   * accepts aliases and answers under its own canonical name, so the key asked
   * for is not necessarily the key returned. Reading the response's own keys is
   * the only join that holds.
   */
  it("keys on the name Kraken answered with, not the one requested", () => {
    const prices = parseTickerPrices(ok({ XXBTZUSD: { c: ["64000.5"] } }));
    expect(prices.get("XBTUSD")).toBeUndefined();
    expect(prices.get("XXBTZUSD")).toBe(64000.5);
  });

  it("refuses a price of zero, which is how a token worth 76 was valued at nothing", () => {
    const prices = parseTickerPrices(ok({ DEADUSD: { c: ["0.0"] }, SOLUSD: { c: ["140.2"] } }));
    expect(prices.has("DEADUSD")).toBe(false);
    expect(prices.get("SOLUSD")).toBe(140.2);
  });

  it("skips a pair with no readable last trade", () => {
    const prices = parseTickerPrices(ok({ A: { c: [] }, B: {}, C: { c: ["1.5"] } }));
    expect([...prices.keys()]).toEqual(["C"]);
  });
});

/**
 * Signing. Two details cause almost every rejected signature: the secret is
 * base64-decoded rather than used as text, and the nonce inside the SHA256 is
 * the same string that appears in the body. Both are pinned here, because a
 * wrong signature fails identically to a wrong key and is diagnosed by neither.
 */
describe("signing", () => {
  const SECRET = Buffer.from("a-test-secret-for-signing").toString("base64");

  /**
   * Kraken's own published vector, from its REST authentication documentation.
   *
   * This is the only test here that is evidence rather than self-consistency:
   * every other signing test would pass just as happily on an implementation
   * that is wrong in the same way twice. A wrong signature is rejected with the
   * same message as a wrong key, so without this the first sign of trouble
   * would be a user being told their credentials are bad when they are fine.
   */
  it("reproduces Kraken's published example exactly", () => {
    const signature = signRequest(
      "/0/private/AddOrder",
      "1616492376594",
      "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25",
      "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg=="
    );
    expect(signature).toBe(
      "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ=="
    );
  });

  it("is stable for one set of inputs", () => {
    const a = signRequest("/0/private/Balance", "1700000000000", "nonce=1700000000000", SECRET);
    const b = signRequest("/0/private/Balance", "1700000000000", "nonce=1700000000000", SECRET);
    expect(a).toBe(b);
  });

  it("is base64 and the right length for SHA-512", () => {
    const sig = signRequest("/0/private/Balance", "1", "nonce=1", SECRET);
    expect(sig).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(Buffer.from(sig, "base64")).toHaveLength(64);
  });

  it("changes with the path, so one signature cannot be replayed on another endpoint", () => {
    const balance = signRequest("/0/private/Balance", "1", "nonce=1", SECRET);
    const trade = signRequest("/0/private/TradeBalance", "1", "nonce=1", SECRET);
    expect(balance).not.toBe(trade);
  });

  it("changes with the nonce and with the body", () => {
    const base = signRequest("/0/private/Balance", "1", "nonce=1", SECRET);
    expect(signRequest("/0/private/Balance", "2", "nonce=2", SECRET)).not.toBe(base);
    expect(signRequest("/0/private/Balance", "1", "nonce=1&asset=ZUSD", SECRET)).not.toBe(base);
  });

  /**
   * The secret is decoded, not used as text. If this ever stops being true
   * every signature silently becomes wrong, and Kraken's answer is the same
   * "Invalid key" a genuinely wrong key produces.
   */
  it("treats the secret as base64", () => {
    const asText = signRequest("/0/private/Balance", "1", "nonce=1", "a-test-secret-for-signing");
    const asBase64 = signRequest("/0/private/Balance", "1", "nonce=1", SECRET);
    expect(asText).not.toBe(asBase64);
  });
});

describe("the key itself", () => {
  it("rejects an empty box and a wallet address pasted by mistake", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey("0x1234567890abcdef1234567890abcdef12345678901234")).toBe(false);
  });

  it("accepts something key-shaped", () => {
    expect(isValidApiKey("A".repeat(56))).toBe(true);
  });

  it("rejects a value with whitespace in it, which is a paste gone wrong", () => {
    expect(isValidApiKey(`${"A".repeat(30)} ${"B".repeat(30)}`)).toBe(false);
  });
});
