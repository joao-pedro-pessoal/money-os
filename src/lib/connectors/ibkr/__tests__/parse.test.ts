import { describe, it, expect } from "vitest";
import {
  num,
  parseAuthStatus,
  authProblem,
  parseAccounts,
  parseLedger,
  parsePosition,
  parsePositions,
  isValidAccountId,
  normalizeAccountId,
} from "../parse";

/**
 * Shapes below are taken from a REAL gateway response, not from the docs.
 * The difference mattered: the documentation implies positions carry a
 * `ticker`, and a live account does not send one at all — only `contractDesc`.
 */
const ACCOUNTS_FIXTURE = [
  {
    id: "U1234567",
    accountId: "U1234567",
    accountVan: "<redacted>",
    accountTitle: "<redacted>",
    displayName: "A Real Name",
    accountAlias: null,
    accountStatus: 0,
    currency: "EUR",
    type: "INDIVIDUAL",
    category: "",
    brokerageAccess: true,
    faclient: false,
    covestor: false,
    noClientTrading: false,
    parent: { mmc: [], accountId: "", isMParent: false, isMChild: false, isMultiplex: false },
  },
];

/** Shape from the IBKR docs for /portfolio/{accountId}/ledger, trimmed. */
const LEDGER_FIXTURE = {
  USD: {
    currency: "USD",
    cashbalance: 5000,
    settledcash: 5000,
    netliquidationvalue: 8000,
    stockmarketvalue: 3000,
    unrealizedpnl: 250,
    realizedpnl: 0,
    exchangerate: 0.9,
  },
  EUR: {
    currency: "EUR",
    cashbalance: 1000,
    settledcash: 1000,
    netliquidationvalue: 1000,
    stockmarketvalue: 0,
    unrealizedpnl: 0,
    exchangerate: 1,
  },
  BASE: {
    currency: "BASE",
    cashbalance: 5500,
    settledcash: 5500,
    netliquidationvalue: 8200,
    stockmarketvalue: 2700,
    unrealizedpnl: 225,
    realizedpnl: 0,
    exchangerate: 1,
  },
};

/**
 * A real gateway response. Note there is NO `ticker` field — the instrument is
 * named only by `contractDesc`, so relying on `ticker` would have produced no
 * positions at all.
 */
const POSITIONS_FIXTURE = [
  {
    acctId: "U1234567",
    conid: 265598,
    contractDesc: "FEMY",
    position: 100,
    mktPrice: 168.42,
    mktValue: 16842,
    currency: "USD",
    avgCost: 150,
    avgPrice: 150,
    realizedPnl: 0,
    unrealizedPnl: 1842,
    exchs: null,
    expiry: null,
    putOrCall: null,
    multiplier: null,
    strike: 0,
    exerciseStyle: null,
    conExchMap: [],
    assetClass: "STK",
    undConid: 0,
    model: "",
  },
];

describe("num", () => {
  it("accepts real numbers and numeric strings", () => {
    expect(num(168.42)).toBe(168.42);
    expect(num("168.42")).toBe(168.42);
    expect(num(0)).toBe(0);
  });

  it("returns null for anything unusable rather than NaN", () => {
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
  });
});

describe("parseAuthStatus / authProblem", () => {
  it("is happy with a live session", () => {
    const status = parseAuthStatus({ authenticated: true, connected: true, competing: false });
    expect(authProblem(status)).toBeNull();
  });

  it("explains an expired session as normal IBKR behaviour, not a fault", () => {
    const status = parseAuthStatus({ authenticated: false, connected: true });
    const msg = authProblem(status)!;
    expect(msg).toMatch(/not logged in/);
    expect(msg).toMatch(/localhost:5000/);
    expect(msg).toMatch(/how IBKR works/);
  });

  it("names the competing-session case, which has a different fix", () => {
    // Logging in again wouldn't help; you have to close the other session.
    const status = parseAuthStatus({ authenticated: true, connected: true, competing: true });
    expect(authProblem(status)).toMatch(/only one at a time/);
  });

  it("distinguishes logged in but not yet connected", () => {
    const status = parseAuthStatus({ authenticated: true, connected: false });
    expect(authProblem(status)).toMatch(/not connected/);
  });

  it("treats missing fields as not authenticated rather than assuming the best", () => {
    expect(parseAuthStatus({}).authenticated).toBe(false);
    expect(parseAuthStatus(null).authenticated).toBe(false);
  });
});

describe("parseAccounts", () => {
  it("reads the account id and currency", () => {
    const accounts = parseAccounts(ACCOUNTS_FIXTURE);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accountId).toBe("U1234567");
    expect(accounts[0].currency).toBe("EUR");
  });

  it("falls back to id when accountId is absent", () => {
    expect(parseAccounts([{ id: "U999" }])[0].accountId).toBe("U999");
  });

  it("skips entries with no identifier at all", () => {
    expect(parseAccounts([{ currency: "USD" }])).toEqual([]);
  });

  it("throws when the gateway returns something that isn't a list", () => {
    expect(() => parseAccounts({ error: "not logged in" })).toThrow(/listing accounts/);
  });

  it("handles an account with no accounts", () => {
    expect(parseAccounts([])).toEqual([]);
  });
});

describe("parseLedger", () => {
  const ledger = parseLedger(LEDGER_FIXTURE);

  it("takes equity from BASE, not from summing the currencies", () => {
    // Summing USD + EUR net liquidation would mix currencies and give 9000.
    expect(ledger.equity).toBe(8200);
  });

  it("reads cash and unrealised P&L in the base currency", () => {
    expect(ledger.cash).toBe(5500);
    expect(ledger.unrealizedPnl).toBe(225);
  });

  it("lists per-currency cash, excluding the synthetic BASE row", () => {
    expect(ledger.balances.map((b) => b.coin).sort()).toEqual(["EUR", "USD"]);
  });

  it("values each currency at its exchange rate into the base", () => {
    const usd = ledger.balances.find((b) => b.coin === "USD")!;
    expect(usd.total).toBe(5000);
    expect(usd.price).toBe(0.9);
    expect(usd.usdValue).toBe(4500);
  });

  it("drops currencies with no cash", () => {
    const parsed = parseLedger({
      ...LEDGER_FIXTURE,
      GBP: { currency: "GBP", cashbalance: 0, netliquidationvalue: 0, exchangerate: 1.2 },
    });
    expect(parsed.balances.find((b) => b.coin === "GBP")).toBeUndefined();
  });

  it("throws when BASE is missing rather than reporting zero equity", () => {
    expect(() => parseLedger({ USD: LEDGER_FIXTURE.USD })).toThrow(/BASE/);
  });

  it("throws on a response that isn't a ledger", () => {
    expect(() => parseLedger(null)).toThrow(/ledger/);
    expect(() => parseLedger("nope")).toThrow(/ledger/);
  });
});

describe("parsePosition", () => {
  const raw = POSITIONS_FIXTURE[0];

  it("names the instrument from contractDesc, since a real account sends no ticker", () => {
    // Relying on `ticker`, which the docs imply exists, would yield nothing.
    expect(raw).not.toHaveProperty("ticker");
    expect(parsePosition(raw)!.coin).toBe("FEMY");
  });

  it("reads a long position", () => {
    const p = parsePosition(raw)!;
    expect(p.coin).toBe("FEMY");
    expect(p.side).toBe("long");
    expect(p.size).toBe(100);
    expect(p.entryPrice).toBe(150);
    expect(p.markPrice).toBe(168.42);
    expect(p.unrealizedPnl).toBe(1842);
  });

  it("reads a negative quantity as short and reports size positive", () => {
    const p = parsePosition({ ...raw, position: -50, mktValue: -8421 })!;
    expect(p.side).toBe("short");
    expect(p.size).toBe(50);
    expect(p.positionValue).toBe(8421);
  });

  it("skips a closed position", () => {
    expect(parsePosition({ ...raw, position: 0 })).toBeNull();
  });

  it("skips an entry with no symbol", () => {
    expect(parsePosition({ position: 10 })).toBeNull();
  });

  it("prefers ticker when a response does happen to carry one", () => {
    expect(parsePosition({ ...raw, ticker: "AAPL" })!.coin).toBe("AAPL");
  });

  it("prefers avgPrice over avgCost, which includes the multiplier on derivatives", () => {
    const p = parsePosition({ ...raw, avgPrice: 150, avgCost: 15000 })!;
    expect(p.entryPrice).toBe(150);
  });

  it("leaves leverage and liquidation unset rather than inventing them", () => {
    // Margin is an account-level property at IBKR, not per position.
    const p = parsePosition(raw)!;
    expect(p.leverage).toBeNull();
    expect(p.liquidationPrice).toBeNull();
  });
});

describe("parsePositions", () => {
  it("parses the documented list", () => {
    expect(parsePositions(POSITIONS_FIXTURE)).toHaveLength(1);
  });

  it("returns an empty list for an account with no positions", () => {
    expect(parsePositions([])).toEqual([]);
  });

  it("throws when the gateway returns something unexpected", () => {
    expect(() => parsePositions({ error: "session expired" })).toThrow(/positions/);
  });
});

describe("isValidAccountId", () => {
  it("accepts live and paper account ids", () => {
    expect(isValidAccountId("U1234567")).toBe(true);
    expect(isValidAccountId("U24164013")).toBe(true);
    expect(isValidAccountId("DU1234567")).toBe(true);
    expect(isValidAccountId("u1234567")).toBe(true);
  });

  it("survives what a copy-paste drags along", () => {
    // These are invisible in an input box, so rejecting them looks like a bug.
    expect(isValidAccountId(" U1234567 ")).toBe(true);
    expect(isValidAccountId("U1234567 ")).toBe(true); // non-breaking space
    expect(isValidAccountId('"U1234567"')).toBe(true);
    expect(isValidAccountId("U 1234567")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidAccountId("1234567")).toBe(false);
    expect(isValidAccountId("U123")).toBe(false);
    expect(isValidAccountId("")).toBe(false);
    expect(isValidAccountId("not an account")).toBe(false);
  });
});

describe("normalizeAccountId", () => {
  it("uppercases and strips padding", () => {
    expect(normalizeAccountId(" u1234567 ")).toBe("U1234567");
  });

  it("removes quotes and non-breaking spaces", () => {
    expect(normalizeAccountId('"U1234567"')).toBe("U1234567");
    expect(normalizeAccountId("U1234567 ")).toBe("U1234567");
  });
});

/**
 * IBKR's ledger reports realised P&L and the app never read it, so closed
 * trades there left no trace — the same gap Hyperliquid had, and in the same
 * shape: the field was declared in the raw type from the start.
 */
describe("realised P&L from the ledger", () => {
  const ledger = (over: Record<string, unknown> = {}) => ({
    BASE: {
      currency: "BASE",
      netliquidationvalue: 35.33,
      cashbalance: 1.75,
      unrealizedpnl: 0.85,
      ...over,
    },
  });

  it("reads what the gateway reports", () => {
    expect(parseLedger(ledger({ realizedpnl: 12.4 })).realizedPnl).toBe(12.4);
  });

  it("keeps a real loss rather than clamping it", () => {
    expect(parseLedger(ledger({ realizedpnl: -8.2 })).realizedPnl).toBe(-8.2);
  });

  it("reports a silent gateway as unknown, never as zero", () => {
    // "You have realised nothing" and "nobody told us" must not render alike.
    expect(parseLedger(ledger()).realizedPnl).toBeNull();
  });

  it("takes it from BASE, not from a per-currency row", () => {
    // Summing the per-currency rows would mix currencies; BASE is the one
    // already converted to the account's own.
    const mixed = {
      BASE: { currency: "BASE", netliquidationvalue: 35.33, realizedpnl: 12.4 },
      EUR: { currency: "EUR", netliquidationvalue: 1.75, realizedpnl: 99 },
    };
    expect(parseLedger(mixed).realizedPnl).toBe(12.4);
  });
});
