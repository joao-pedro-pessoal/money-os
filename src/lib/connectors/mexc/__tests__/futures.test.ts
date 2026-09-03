import { describe, it, expect } from "vitest";
import {
  contractError,
  futuresSignature,
  sortedQuery,
  parseFuturesAssets,
  parseContractSizes,
  parseOpenPositions,
  parseHistoryPositions,
  coinOf,
  settleOf,
  settlementRate,
} from "../futures";
import { mexcError } from "../parse";

/** Shapes from MEXC's published contract API docs. */
const SIZES = new Map([
  ["BTC_USDT", 0.0001],
  ["ETH_USDT", 0.01],
]);

describe("the envelope", () => {
  it("treats code 0 as success", () => {
    expect(contractError({ success: true, code: 0, data: [] })).toBeNull();
  });

  it("reports any non-zero code", () => {
    expect(contractError({ success: false, code: 1004, msg: "sign check failed" })).toBe(
      "sign check failed (code 1004)"
    );
  });

  /**
   * The contract API is documented to answer `msg`, but the futures host has
   * been seen using `message`. Both are read: a refusal whose message this
   * could not find would be reported as "no message", never as success.
   */
  it("finds the message under either spelling, and never mistakes one for success", () => {
    expect(contractError({ code: 602, message: "signature verify failed" })).toBe(
      "signature verify failed (code 602)"
    );
    expect(contractError({ code: 602 })).toBe("no message (code 602)");
  });

  /**
   * The spot connector's error test is wrong here in the direction that hurts.
   * A futures reply carries a code on *success* too, and `mexcError` treats a
   * code with no `msg` as no error — so `{success:true,code:0}` is fine, but a
   * `{code:602,message:...}` refusal would slip through it as "no error" and be
   * parsed for assets, finding none. Two hosts, two envelopes, two functions.
   */
  it("is not interchangeable with the spot connector's error test", () => {
    const refusal = { code: 602, message: "signature verify failed" };
    expect(mexcError(refusal)).toBeNull();
    expect(contractError(refusal)).not.toBeNull();
  });
});

describe("signing", () => {
  /**
   * `accessKey + timestamp + parameterString`, HMAC-SHA256, hex — MEXC's
   * documented recipe, which is not the spot one and not Binance's.
   */
  it("signs the documented target string", () => {
    const signature = futuresSignature("mx0key", "secret", "1700000000000", "page_num=1");
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    // The same inputs in a different order must not produce the same digest.
    expect(signature).not.toBe(futuresSignature("secret", "mx0key", "1700000000000", "page_num=1"));
  });

  /**
   * The docs require dictionary order. Insertion order happens to match for
   * page_num/page_size and would break silently the day a parameter is added
   * between them — an invalid signature reads exactly like a wrong key.
   */
  it("sorts parameters in dictionary order, not insertion order", () => {
    expect(sortedQuery({ page_size: 100, page_num: 1 })).toBe("page_num=1&page_size=100");
    expect(sortedQuery({ symbol: "BTC_USDT", page_num: 1 })).toBe("page_num=1&symbol=BTC_USDT");
    expect(sortedQuery({})).toBe("");
  });
});

describe("account assets", () => {
  const PAYLOAD = {
    success: true,
    code: 0,
    data: [
      {
        currency: "USDT",
        positionMargin: 12.5,
        availableBalance: 30,
        cashBalance: 40,
        frozenBalance: 0,
        equity: 42.5,
        unrealized: 2.5,
        bonus: 0,
      },
      { currency: "BTC", positionMargin: 0, availableBalance: 0, cashBalance: 0, equity: 0, unrealized: 0 },
    ],
  };

  it("reads the currencies that hold something and drops the empty ones", () => {
    const assets = parseFuturesAssets(PAYLOAD);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toEqual({
      currency: "USDT",
      equity: 42.5,
      available: 30,
      positionMargin: 12.5,
      unrealized: 2.5,
    });
  });

  /**
   * The double count this codebase removes most often. MEXC's `equity` of 42.5
   * already contains the 2.5 of floating profit; adding them would report 45.
   */
  it("takes equity as stated, with the unrealised profit already inside it", () => {
    const [asset] = parseFuturesAssets(PAYLOAD);
    expect(asset.equity).toBe(42.5);
    expect(asset.equity).not.toBe(42.5 + asset.unrealized);
  });

  it("does not recompute equity from cashBalance and unrealized", () => {
    // 40 + 2.5 happens to equal 42.5 here. If MEXC ever counts a bonus or a
    // fee differently, the stated figure is still the account's value and a
    // second definition of it would quietly disagree.
    const odd = {
      code: 0,
      data: [{ currency: "USDT", cashBalance: 40, unrealized: 2.5, equity: 41.9, availableBalance: 30, positionMargin: 0 }],
    };
    expect(parseFuturesAssets(odd)[0].equity).toBe(41.9);
  });

  it("has nothing to say about a refusal", () => {
    expect(parseFuturesAssets({ code: 602, message: "nope" })).toEqual([]);
    expect(parseFuturesAssets(null)).toEqual([]);
  });
});

describe("contract sizes", () => {
  it("reads how many coins one contract is", () => {
    const sizes = parseContractSizes({
      code: 0,
      data: [
        { symbol: "BTC_USDT", contractSize: 0.0001 },
        { symbol: "ETH_USDT", contractSize: 0.01 },
      ],
    });
    expect(sizes.get("BTC_USDT")).toBe(0.0001);
  });

  /** A contract worth zero coins is not a contract; defaulting it to 1 would
      misreport every position in it by four orders of magnitude. */
  it("refuses a zero or missing size rather than defaulting it", () => {
    const sizes = parseContractSizes({
      code: 0,
      data: [{ symbol: "DEAD_USDT", contractSize: 0 }, { symbol: "NIL_USDT" }],
    });
    expect(sizes.size).toBe(0);
  });
});

describe("open positions", () => {
  const PAYLOAD = {
    code: 0,
    data: [
      {
        positionId: 1,
        symbol: "BTC_USDT",
        positionType: 1,
        openType: 1,
        state: 1,
        holdVol: 500,
        holdAvgPrice: 60000,
        liquidatePrice: 45000,
        leverage: 10,
        realised: 3.2,
        im: 30,
      },
    ],
  };

  /**
   * The one that produces a plausible number when wrong. 500 contracts of
   * BTC_USDT is 0.05 BTC, not 500 BTC — a ten-thousand-fold error that looks
   * like an ordinary quantity.
   */
  it("converts contracts to coins", () => {
    const { positions } = parseOpenPositions(PAYLOAD, SIZES);
    expect(positions[0].size).toBeCloseTo(0.05, 10);
    expect(positions[0].size).not.toBe(500);
  });

  it("reads direction from positionType", () => {
    expect(parseOpenPositions(PAYLOAD, SIZES).positions[0].side).toBe("long");
    const short = { code: 0, data: [{ ...PAYLOAD.data[0], positionType: 2 }] };
    expect(parseOpenPositions(short, SIZES).positions[0].side).toBe("short");
  });

  /**
   * MEXC calls an open position's floating result `realised`. It is the
   * venue's word, not this app's — the position is open, so by every
   * definition here that profit is unrealised.
   */
  it("files MEXC's `realised` on an open position as unrealised", () => {
    expect(parseOpenPositions(PAYLOAD, SIZES).positions[0].unrealizedPnl).toBe(3.2);
  });

  it("names the margin mode", () => {
    expect(parseOpenPositions(PAYLOAD, SIZES).positions[0].leverageType).toBe("isolated");
    const cross = { code: 0, data: [{ ...PAYLOAD.data[0], openType: 2 }] };
    expect(parseOpenPositions(cross, SIZES).positions[0].leverageType).toBe("cross");
  });

  /**
   * A size that cannot be converted is reported, never guessed. Dropping the
   * row costs nothing in the totals — equity already holds its profit and
   * positionMargin its collateral — against a size wrong by four orders.
   */
  it("reports a position whose contract size is unknown instead of stating a wrong size", () => {
    const unknown = { code: 0, data: [{ ...PAYLOAD.data[0], symbol: "NEW_USDT" }] };
    const result = parseOpenPositions(unknown, SIZES);
    expect(result.positions).toEqual([]);
    expect(result.unconvertible).toEqual(["NEW_USDT"]);
  });
});

describe("closed positions become trade history", () => {
  const PAYLOAD = {
    code: 0,
    data: [
      {
        positionId: 88,
        symbol: "ETH_USDT",
        positionType: 1,
        state: 3,
        holdVol: 0,
        closeVol: 300,
        holdAvgPrice: 2400,
        closeAvgPrice: 2500,
        realised: 3,
        leverage: 5,
        updateTime: 1756900000000,
      },
    ],
  };

  it("makes one row per closed position, in the venue's own quantities", () => {
    const [row] = parseHistoryPositions(PAYLOAD, SIZES);
    expect(row.symbol).toBe("ETH");
    expect(row.quantity).toBeCloseTo(3, 10); // 300 contracts x 0.01
    expect(row.price).toBe(2500);
    expect(row.currency).toBe("USDT");
  });

  /**
   * MEXC states the realised result, so it travels on the row and nothing is
   * derived — `lib/trading/realised.ts` only computes one where the venue is
   * silent, and mixing the two inside one instrument gives a number belonging
   * to neither method.
   */
  it("carries the venue's realised figure", () => {
    expect(parseHistoryPositions(PAYLOAD, SIZES)[0].realizedPnl).toBe(3);
  });

  it("closes a long as a sale and a short as a purchase", () => {
    expect(parseHistoryPositions(PAYLOAD, SIZES)[0].type).toBe("SELL");
    const short = { code: 0, data: [{ ...PAYLOAD.data[0], positionType: 2 }] };
    expect(parseHistoryPositions(short, SIZES)[0].type).toBe("BUY");
  });

  /** The venue's own id, which is what makes a re-sync idempotent. */
  it("keys the row on MEXC's position id", () => {
    expect(parseHistoryPositions(PAYLOAD, SIZES)[0].externalId).toBe("mexc-futures-88");
  });

  /**
   * A trade filed under the wrong day corrupts every window a filter can
   * select. An absent trade at least announces itself as missing.
   */
  it("skips a row whose close time cannot be read rather than dating it to now", () => {
    const undated = { code: 0, data: [{ ...PAYLOAD.data[0], updateTime: undefined }] };
    expect(parseHistoryPositions(undated, SIZES)).toEqual([]);
  });

  it("falls back to the open time when there is no update time", () => {
    const created = { code: 0, data: [{ ...PAYLOAD.data[0], updateTime: undefined, createTime: 1756800000000 }] };
    expect(parseHistoryPositions(created, SIZES)).toHaveLength(1);
  });

  /** A contract count is not a quantity of anything. */
  it("reports no quantity rather than a contract count when the size is unknown", () => {
    const unknown = { code: 0, data: [{ ...PAYLOAD.data[0], symbol: "NEW_USDT" }] };
    const [row] = parseHistoryPositions(unknown, SIZES);
    expect(row.quantity).toBeNull();
    // The realised result is still true and still worth keeping.
    expect(row.realizedPnl).toBe(3);
  });

  it("orders oldest first", () => {
    const two = {
      code: 0,
      data: [
        { ...PAYLOAD.data[0], positionId: 2, updateTime: 1756999999999 },
        { ...PAYLOAD.data[0], positionId: 1, updateTime: 1756800000000 },
      ],
    };
    expect(parseHistoryPositions(two, SIZES).map((r) => r.externalId)).toEqual([
      "mexc-futures-1",
      "mexc-futures-2",
    ]);
  });
});

/**
 * MEXC puts a separator in its contract names, so reading the base coin is
 * reading what the venue stated — the opposite of decomposing `BTCBUSD`, where
 * the boundary is a guess.
 */
describe("reading a contract name", () => {
  it("takes the base and the settlement currency from the venue's own separator", () => {
    expect(coinOf("BTC_USDT")).toBe("BTC");
    expect(settleOf("BTC_USDT")).toBe("USDT");
  });

  it("does not fall apart on a name with no separator", () => {
    expect(coinOf("BTCUSDT")).toBe("BTCUSDT");
    // Never the empty string: a row with no currency is dropped from every
    // total by sumInBase, which would lose a real trade instead of showing it.
    expect(settleOf("BTCUSDT")).toBe("USDT");
  });
});

/**
 * MEXC settles in four things across the 1 170 contracts it lists — USDT,
 * USDC, USD and USD1 — counted against the live `contract/detail`. Summing an
 * account's rows without converting would be adding different currencies.
 */
describe("settlement currencies", () => {
  const ticker = (asset: string) => (asset === "USD1" ? 0.999 : asset === "USDT" ? 1 : null);

  it("treats USD as the unit itself rather than asking a crypto ticker for it", () => {
    // There is no USDUSDT pair. Left to `priceInDollars`, a real balance in a
    // USD-settled contract would have been reported as unpriceable.
    expect(settlementRate("USD", ticker)).toBe(1);
    expect(ticker("USD")).toBeNull();
  });

  it("prices a stablecoin through the market, because a peg is a fact about a holding", () => {
    expect(settlementRate("USD1", ticker)).toBe(0.999);
    expect(settlementRate("USDT", ticker)).toBe(1);
  });

  it("reports nothing it cannot price rather than assuming a dollar", () => {
    expect(settlementRate("WEIRD", ticker)).toBeNull();
  });

  it("does not care about case", () => {
    expect(settlementRate("usd", ticker)).toBe(1);
  });
});
