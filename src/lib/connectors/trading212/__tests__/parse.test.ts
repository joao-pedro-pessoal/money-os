import { describe, it, expect, beforeEach } from "vitest";
import {
  parseAccountSummary,
  parsePositions,
  pickNumber,
  pickString,
  pickArray,
  dig,
  explainHttpError,
  isValidApiKey,
  describeKeys,
  basicAuthHeader,
  parseInstruments,
  parseDividends,
  nextPagePath,
} from "../parse";
import { createTrading212Connector, T212_LIVE_BASE_URL, clearInstrumentCache } from "../index";

beforeEach(() => {
  // The catalogue is cached across syncs on purpose; tests must not inherit
  // one another's copy.
  clearInstrumentCache();
});

/** The documented shape of GET /api/v0/equity/account/summary. */
const SUMMARY = {
  cash: { availableToTrade: 120.5, inPies: 30, reservedForOrders: 10 },
  currency: "EUR",
  id: 12345678,
  investments: {
    currentValue: 5170.25,
    realizedProfitLoss: 88.4,
    totalCost: 4950,
    unrealizedProfitLoss: 220.25,
  },
  totalValue: 5320.75,
};

/** The documented shape of one row from GET /api/v0/equity/positions. */
const POSITION = {
  averagePricePaid: 150,
  createdAt: "2025-02-03T10:00:00Z",
  currentPrice: 170,
  instrument: { currency: "USD", isin: "US0378331005", name: "Apple", ticker: "AAPL_US_EQ" },
  quantity: 3,
  quantityAvailableForTrading: 3,
  quantityInPies: 0,
  walletImpact: {
    currency: "EUR",
    currentValue: 470.1,
    fxImpact: -6.2,
    totalCost: 415,
    unrealizedProfitLoss: 55.1,
  },
};

describe("reaching into a nested payload", () => {
  it("walks a dotted path", () => {
    expect(dig(SUMMARY, "cash.availableToTrade")).toBe(120.5);
  });

  it("gives up quietly on a path that isn't there", () => {
    expect(dig(SUMMARY, "cash.nope.deeper")).toBeUndefined();
    expect(dig(null, "a.b")).toBeUndefined();
  });

  it("takes the first path that has a number", () => {
    expect(pickNumber(SUMMARY, ["nope", "totalValue"])).toBe(5320.75);
  });

  it("accepts a number sent as a string", () => {
    expect(pickNumber({ totalValue: "1234.56" }, ["totalValue"])).toBe(1234.56);
  });

  it("reports absence as null, never as zero", () => {
    // The distinction the file exists for: a missing balance must stop the
    // sync, and a zero would sail through and wipe the account's value.
    expect(pickNumber({}, ["totalValue"])).toBeNull();
    expect(pickNumber({ totalValue: null }, ["totalValue"])).toBeNull();
    expect(pickNumber({ totalValue: "abc" }, ["totalValue"])).toBeNull();
    expect(pickNumber({ totalValue: Number.POSITIVE_INFINITY }, ["totalValue"])).toBeNull();
  });

  it("keeps a real zero", () => {
    expect(pickNumber({ v: 0 }, ["v"])).toBe(0);
  });

  it("reads and trims strings", () => {
    expect(pickString({ currency: " EUR " }, ["currency"])).toBe("EUR");
    expect(pickString({ currency: "" }, ["currency"])).toBeNull();
  });

  it("finds a list bare or wrapped", () => {
    expect(pickArray([1], ["items"])).toEqual([1]);
    expect(pickArray({ items: [1] }, ["items"])).toEqual([1]);
    expect(pickArray({ other: 1 }, ["items"])).toEqual([]);
  });
});

describe("the account summary", () => {
  it("reads the documented reply", () => {
    const cash = parseAccountSummary(SUMMARY);
    expect(cash.total).toBe(5320.75);
    expect(cash.currency).toBe("EUR");
    expect(cash.unrealised).toBe(220.25);
  });

  it("counts uninvested pie cash as free, because it is", () => {
    expect(parseAccountSummary(SUMMARY).free).toBe(150.5);
  });

  it("excludes cash reserved for pending orders", () => {
    // It isn't available to you — that's what the field means.
    expect(parseAccountSummary(SUMMARY).free).not.toBe(160.5);
  });

  it("stops, naming the fields it saw, when there is no total", () => {
    expect(() => parseAccountSummary({ cash: {}, currency: "EUR" })).toThrow(/cash, currency/);
  });

  it("survives a summary with no cash section at all", () => {
    const cash = parseAccountSummary({ totalValue: 10 });
    expect(cash.total).toBe(10);
    expect(cash.free).toBeNull();
  });

  it("keeps a zero balance as zero", () => {
    expect(parseAccountSummary({ totalValue: 0 }).total).toBe(0);
  });
});

describe("open positions", () => {
  it("normalises the documented row", () => {
    const [p] = parsePositions([POSITION]);
    expect(p.coin).toBe("AAPL_US_EQ");
    expect(p.side).toBe("long");
    expect(p.size).toBe(3);
    expect(p.entryPrice).toBe(150);
    expect(p.markPrice).toBe(170);
    // Unlabelled until the instrument catalogue has been read; see below.
    expect(p.assetClass).toBeNull();
  });

  it("values a foreign holding in the account's currency, not the instrument's", () => {
    // quantity × currentPrice would be 510 USD reported as if it were EUR.
    // walletImpact.currentValue is already converted.
    expect(parsePositions([POSITION])[0].positionValue).toBe(470.1);
  });

  it("does not add the fx impact on top of the profit", () => {
    // unrealizedProfitLoss is currentValue − totalCost, so the currency swing
    // is already inside it. Adding fxImpact again would count it twice.
    expect(parsePositions([POSITION])[0].unrealizedPnl).toBe(55.1);
  });

  it("falls back to price × quantity when there is no wallet figure", () => {
    const bare = { instrument: { ticker: "X" }, quantity: 2, currentPrice: 10 };
    expect(parsePositions([bare])[0].positionValue).toBe(20);
  });

  it("leaves the value unknown rather than guessing without a price", () => {
    const [p] = parsePositions([{ instrument: { ticker: "X" }, quantity: 2 }]);
    expect(p.positionValue).toBeNull();
  });

  it("skips rows that aren't holdings any more", () => {
    expect(parsePositions([{ instrument: { ticker: "X" }, quantity: 0 }])).toHaveLength(0);
    expect(parsePositions([{ quantity: 5 }])).toHaveLength(0);
    expect(parsePositions([null, "nonsense"])).toHaveLength(0);
  });

  it("honours a negative quantity instead of assuming long-only", () => {
    const short = { ...POSITION, quantity: -3 };
    const [p] = parsePositions([short]);
    expect(p.side).toBe("short");
    expect(p.size).toBe(3);
  });

  it("reads a list wrapped in items", () => {
    expect(parsePositions({ items: [POSITION] })).toHaveLength(1);
  });

  it("never invents leverage for a cash equity account", () => {
    const [p] = parsePositions([POSITION]);
    expect(p.leverage).toBeNull();
    expect(p.liquidationPrice).toBeNull();
    expect(p.marginUsed).toBeNull();
  });
});

describe("the instrument catalogue", () => {
  const CATALOGUE = [
    { ticker: "AAPL_US_EQ", type: "STOCK", name: "Apple", isin: "US0378331005" },
    { ticker: "IGLAI_EQ", type: "ETF", name: "iShares Global Aggregate Bond", isin: "IE00B3F81409" },
    { ticker: "BTC_EQ", type: "CRYPTOCURRENCY", name: "Bitcoin", isin: null },
  ];

  it("keys instruments by ticker", () => {
    const map = parseInstruments(CATALOGUE);
    expect(map.get("IGLAI_EQ")?.type).toBe("ETF");
    expect(map.get("IGLAI_EQ")?.name).toBe("iShares Global Aggregate Bond");
  });

  it("skips rows with no ticker or no type", () => {
    expect(parseInstruments([{ type: "ETF" }, { ticker: "X" }, null]).size).toBe(0);
  });

  it("labels a position from the catalogue", () => {
    const map = parseInstruments(CATALOGUE);
    const etf = { instrument: { ticker: "IGLAI_EQ" }, quantity: 1 };
    expect(parsePositions([etf], map)[0].assetClass).toBe("ETF");
  });

  it("says nothing rather than guessing when the ticker is unknown", () => {
    // `_EQ` is carried by ordinary shares and by iShares trackers alike, so
    // there is nothing in the ticker to read. A wrong label silently skews the
    // allocation; a blank one is visible and one click to fix.
    const map = parseInstruments(CATALOGUE);
    const unknown = { instrument: { ticker: "MYSTERY_EQ" }, quantity: 1 };
    expect(parsePositions([unknown], map)[0].assetClass).toBeNull();
  });

  it("leaves everything unlabelled when no catalogue was loaded", () => {
    expect(parsePositions([POSITION])[0].assetClass).toBeNull();
  });
});

describe("the Basic authorization header", () => {
  it("is base64 of key:secret, prefixed with Basic", () => {
    // The bug from the first attempt: the bare key in Authorization is the
    // older scheme, and a modern key pair answers it with 401.
    expect(basicAuthHeader("KEY", "SECRET")).toBe("Basic S0VZOlNFQ1JFVA==");
  });

  it("round-trips back to the original pair", () => {
    const header = basicAuthHeader("abc123", "s3cr3t");
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe("abc123:s3cr3t");
  });

  it("survives characters that aren't plain ASCII", () => {
    const header = basicAuthHeader("kéy", "sécret");
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe("kéy:sécret");
  });
});

describe("errors you can act on", () => {
  it("points at both boxes on 401", () => {
    expect(explainHttpError(401, "")).toMatch(/API key goes in one box/i);
  });

  it("says which permission to check on 403", () => {
    expect(explainHttpError(403, "")).toMatch(/permission|IP restriction/i);
  });

  it("gives the actual limit on 429", () => {
    expect(explainHttpError(429, "")).toMatch(/five seconds/i);
  });

  it("blames the right side on a 503", () => {
    expect(explainHttpError(503, "")).toMatch(/their side/i);
  });

  it("passes an unknown status through with a trimmed body", () => {
    const msg = explainHttpError(418, "x".repeat(500));
    expect(msg).toContain("418");
    expect(msg.length).toBeLessThan(300);
  });

  it("describes what a broken payload actually contained", () => {
    expect(describeKeys({ a: 1, b: 2 })).toBe("a, b");
  });
});

describe("the connector", () => {
  const credentials = { apiKey: "abcdefgh1234", apiSecret: "s3cr3t" };

  const stub = (responses: Record<string, unknown>) => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const http = async (url: string, headers: Record<string, string>) => {
      seen.push({ url, headers });
      const key = Object.keys(responses).find((k) => url.includes(k));
      if (!key) throw new Error(`unexpected call to ${url}`);
      return responses[key];
    };
    return { http, seen };
  };

  const ok = {
    "/equity/metadata/instruments": [
      { ticker: "AAPL_US_EQ", type: "STOCK", name: "Apple", isin: "US0378331005" },
    ],
    "/equity/account/summary": SUMMARY,
    "/equity/positions": [POSITION],
  };

  it("authenticates with Basic, not with the bare key", async () => {
    const { http, seen } = stub(ok);
    await createTrading212Connector(credentials, http).getAccountState("");
    expect(seen[0].headers.Authorization).toBe(basicAuthHeader("abcdefgh1234", "s3cr3t"));
    expect(seen[0].headers.Authorization).toMatch(/^Basic /);
  });

  it("calls the documented endpoints", async () => {
    const { http, seen } = stub(ok);
    await createTrading212Connector(credentials, http).getAccountState("");
    expect(seen.map((s) => s.url)).toEqual([
      `${T212_LIVE_BASE_URL}/equity/account/summary`,
      `${T212_LIVE_BASE_URL}/equity/metadata/instruments`,
      `${T212_LIVE_BASE_URL}/equity/positions`,
    ]);
  });

  it("asks for the summary first, so a bad key fails cheaply", async () => {
    const { http, seen } = stub(ok);
    await createTrading212Connector(credentials, http).getAccountState("");
    expect(seen[0].url).toContain("/equity/account/summary");
  });

  it("classifies positions from the catalogue", async () => {
    const { http } = stub(ok);
    const state = await createTrading212Connector(credentials, http).getAccountState("");
    expect(state.positions[0].assetClass).toBe("STOCK");
  });

  it("reads the catalogue once and reuses it on the next sync", async () => {
    // Rate-limited to one call every fifty seconds, and it changes daily at
    // most — spending a request on it every sync would be waste.
    const { http, seen } = stub(ok);
    const connector = createTrading212Connector(credentials, http);
    await connector.getAccountState("");
    await connector.getAccountState("");
    const catalogueCalls = seen.filter((s) => s.url.includes("/metadata/instruments"));
    expect(catalogueCalls).toHaveLength(1);
  });

  it("still reports the balance when the catalogue call fails", async () => {
    // Losing the labels is a nuisance. Losing the balance because of the
    // labels would be a bug.
    const http = async (url: string) => {
      if (url.includes("/metadata/instruments")) throw new Error("429 rate limited");
      if (url.includes("/summary")) return SUMMARY;
      return [POSITION];
    };
    const state = await createTrading212Connector(credentials, http).getAccountState("");
    expect(state.equity).toBe(5320.75);
    expect(state.positions[0].assetClass).toBeNull();
  });

  it("reports positions as part of equity, never beside it", async () => {
    const { http } = stub(ok);
    const state = await createTrading212Connector(credentials, http).getAccountState("");
    expect(state.equity).toBe(5320.75);
    expect(state.balancesAreSeparatePool).toBe(false);
    expect(state.totalNotionalPosition).toBe(470.1);
  });

  it("shows free cash as a balance in the account's own currency", async () => {
    const { http } = stub(ok);
    const state = await createTrading212Connector(credentials, http).getAccountState("");
    expect(state.balances).toEqual([
      // Free cash: no cost basis, and null rather than 0 so it is never read as
      // a holding that happens to be exactly break-even.
      { coin: "EUR", total: 150.5, hold: 0, price: 1, usdValue: 150.5, costBasis: null },
    ]);
  });

  it("has no balance row when the summary reports no cash", async () => {
    const { http } = stub({ "/equity/account/summary": { totalValue: 10 }, "/equity/positions": [] });
    const state = await createTrading212Connector(credentials, http).getAccountState("");
    expect(state.balances).toEqual([]);
  });

  it("exposes no way to place an order", () => {
    // Reading is all it can do. Trading 212's API places market, limit and
    // stop orders; none of those paths is imported, so the capability doesn't
    // exist to be reached by mistake.
    const connector = createTrading212Connector(credentials, async () => ({}));
    expect(Object.keys(connector).sort()).toEqual([
      "getAccountState",
      "getDividends",
      "platform",
      "validateIdentifier",
    ]);
  });
});

describe("dividend history", () => {
  const DIVIDEND = {
    amount: 12.34,
    amountInEuro: 12.34,
    currency: "EUR",
    grossAmountPerShare: 0.24,
    instrument: { currency: "USD", isin: "US0378331005", name: "Apple", ticker: "AAPL_US_EQ" },
    paidOn: "2026-02-13T00:00:00Z",
    quantity: 51.4,
    reference: "DIV-991",
    ticker: "AAPL_US_EQ",
    type: "ORDINARY",
  };

  it("reads the documented payload", () => {
    const [d] = parseDividends({ items: [DIVIDEND] });
    expect(d.ticker).toBe("AAPL_US_EQ");
    expect(d.amount).toBe(12.34);
    expect(d.grossPerShare).toBe(0.24);
    expect(d.reference).toBe("DIV-991");
    expect(d.paidOn.toISOString()).toBe("2026-02-13T00:00:00.000Z");
  });

  it("skips a row with no date rather than dating it today", () => {
    // A payment filed on the wrong day corrupts the cadence inferred from it.
    expect(parseDividends({ items: [{ ...DIVIDEND, paidOn: undefined }] })).toHaveLength(0);
    expect(parseDividends({ items: [{ ...DIVIDEND, paidOn: "not a date" }] })).toHaveLength(0);
  });

  it("skips a row with no amount", () => {
    expect(parseDividends({ items: [{ ...DIVIDEND, amount: null, amountInEuro: null }] })).toHaveLength(0);
  });

  it("keeps a zero payment, which is a real thing", () => {
    expect(parseDividends({ items: [{ ...DIVIDEND, amount: 0 }] })).toHaveLength(1);
  });

  it("finds the next page and strips the prefix baseUrl already carries", () => {
    expect(nextPagePath({ nextPagePath: "/api/v0/equity/history/dividends?cursor=17" })).toBe(
      "/api/v0/equity/history/dividends?cursor=17"
    );
    expect(nextPagePath({ nextPagePath: null })).toBeNull();
    expect(nextPagePath({})).toBeNull();
  });

  it("walks every page", async () => {
    const pages: Record<string, unknown> = {
      "history/dividends?limit=50": {
        items: [DIVIDEND],
        nextPagePath: "/api/v0/equity/history/dividends?cursor=2",
      },
      "cursor=2": { items: [{ ...DIVIDEND, reference: "DIV-992" }], nextPagePath: null },
    };
    const http = async (url: string) => {
      const key = Object.keys(pages).find((k) => url.includes(k));
      if (!key) throw new Error(`unexpected ${url}`);
      return pages[key];
    };
    const all = await createTrading212Connector(credentialsForHistory, http).getDividends!();
    expect(all.map((d) => d.reference)).toEqual(["DIV-991", "DIV-992"]);
  });

  it("stops instead of looping forever on a page that points at itself", async () => {
    // A bug on either side must not become an endless run against a live API.
    let calls = 0;
    const http = async () => {
      calls++;
      return { items: [], nextPagePath: "/api/v0/equity/history/dividends?cursor=1" };
    };
    await createTrading212Connector(credentialsForHistory, http).getDividends!();
    expect(calls).toBeLessThanOrEqual(40);
  });
});

const credentialsForHistory = { apiKey: "abcdefgh1234", apiSecret: "s3cr3t" };

describe("checking the key before saving it", () => {
  it("accepts a plausible key", () => {
    expect(isValidApiKey("12345678abcdefgh")).toBe(true);
  });

  it("rejects an empty or truncated paste", () => {
    expect(isValidApiKey("")).toBe(false);
    expect(isValidApiKey("abc")).toBe(false);
  });

  it("rejects something with spaces in it", () => {
    expect(isValidApiKey("my api key")).toBe(false);
  });
});
