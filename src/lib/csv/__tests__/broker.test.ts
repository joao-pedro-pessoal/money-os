import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseBrokerCsv,
  normaliseKind,
  naturalKey,
  matchTicker,
  summariseCashFlows,
  growthBreakdown,
  checkOpeningBalance,
  cumulativeHistory,
  type BrokerEvent,
  type CashFlowSummary,
} from "../broker";

/**
 * The real export, kept verbatim.
 *
 * A hand-written fixture only ever contains the cases you already thought of.
 * This one is the actual file, so a change to the parser is measured against
 * what the broker really produces.
 */
const REAL = readFileSync(join(__dirname, "fixtures/trading212-statement.csv"), "utf8");

describe("reading the real statement", () => {
  const { events, rejected } = parseBrokerCsv(REAL);

  it("reads every row", () => {
    expect(rejected).toEqual([]);
    // 65 + 30 + 5 + 4 + 3, which is every line in the file bar the header.
    expect(events).toHaveLength(107);
  });

  it("finds each kind of event", () => {
    const counts = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ INTEREST: 65, BUY: 30, DEPOSIT: 5, WITHDRAWAL: 4, DIVIDEND: 3 });
  });

  it("keeps a buy as money leaving the account", () => {
    const buy = events.find((e) => e.kind === "BUY")!;
    expect(buy.amount).toBeLessThan(0);
    expect(buy.symbol).toBeTruthy();
    expect(buy.quantity).toBeGreaterThan(0);
  });

  it("keeps the fractional quantities a fractional-share broker produces", () => {
    // 1.24532154 shares. Rounding these would misstate the position.
    const buy = events.find((e) => e.symbol === "IGLA" && e.kind === "BUY")!;
    expect(buy.quantity).toBeCloseTo(1.24532154, 8);
  });

  it("reads a row with an empty fee as no fee, not as zero fee", () => {
    const noFee = events.find((e) => e.line === 4)!;
    expect(noFee.fees).toBeNull();
  });

  it("attaches dividends to their instrument", () => {
    const dividends = events.filter((e) => e.kind === "DIVIDEND");
    expect(dividends.map((d) => d.symbol).sort()).toEqual(["EUN3", "EUN3", "IPRP"]);
    expect(dividends.every((d) => d.amount > 0)).toBe(true);
  });

  it("leaves interest without an instrument, because it has none", () => {
    const interest = events.filter((e) => e.kind === "INTEREST");
    expect(interest.every((e) => e.symbol === null)).toBe(true);
  });
});

describe("what you added versus what you made", () => {
  const { events } = parseBrokerCsv(REAL);
  const flows = summariseCashFlows(events);

  it("adds up the deposits and the withdrawals", () => {
    expect(flows.deposits).toBe(260);
    expect(flows.withdrawals).toBe(306);
  });

  it("nets them into what was actually committed", () => {
    expect(flows.net).toBe(-46);
  });

  it("ignores buys and sells, which move money without adding any", () => {
    // Thirty buys totalling well over a hundred euros, none of it new money.
    expect(flows.deposits! + flows.withdrawals!).toBeLessThan(600);
  });

  it("names the single currency the figures are in", () => {
    expect(flows.currency).toBe("EUR");
    expect(flows.currencies).toEqual(["EUR"]);
  });

  it("separates growth from money paid in", () => {
    // The whole reason the statement matters: a balance that rose because you
    // deposited is not a balance that rose because you did well.
    const g = growthBreakdown(125.39, flows)!;
    expect(g.netContributed).toBe(-46);
    expect(g.gain).toBe(171.39);
  });

  it("reports no return when nothing was committed", () => {
    // Dividing by zero would print Infinity next to someone's money.
    const g = growthBreakdown(100, single({ deposits: 0, withdrawals: 0, net: 0 }))!;
    expect(g.returnPercent).toBeNull();
  });

  it("works out a percentage on what was actually committed", () => {
    const g = growthBreakdown(220, single({ deposits: 100, withdrawals: 0, net: 100 }), 100)!;
    // 220 now, 100 opening, 100 added → 20 earned on 200 committed.
    expect(g.gain).toBe(20);
    expect(g.returnPercent).toBe(10);
  });

  it("handles an account with no cash movements at all", () => {
    const flat = summariseCashFlows([]);
    // Zero, not null: nothing moved is a measurement. And no currency, because
    // there is nothing here to denominate.
    expect(flat).toEqual({
      deposits: 0,
      withdrawals: 0,
      net: 0,
      currency: null,
      currencies: [],
      first: null,
      last: null,
    });
  });
});

/**
 * Money in two currencies does not add.
 *
 * `BrokerEvent` has always carried a `currency` and `summariseCashFlows` used
 * to sum straight through it, producing a figure denominated in nothing — which
 * the screen then labelled with the page's own currency symbol. An IBKR export
 * covering a dollar and a euro account is the ordinary way to reach it.
 */
describe("a statement that mixes currencies", () => {
  const flow = (kind: "DEPOSIT" | "WITHDRAWAL", amount: number, currency: string): BrokerEvent => ({
    date: new Date("2026-03-01T00:00:00Z"),
    kind,
    symbol: null,
    isin: null,
    quantity: null,
    price: null,
    amount,
    fees: null,
    currency,
    description: null,
    externalId: null,
    line: 1,
  });

  const mixed = summariseCashFlows([
    flow("DEPOSIT", 1000, "EUR"),
    flow("DEPOSIT", 1000, "USD"),
    flow("WITHDRAWAL", -200, "USD"),
  ]);

  it("refuses to total them, rather than adding 1000 € to 1000 $", () => {
    expect(mixed.deposits).toBeNull();
    expect(mixed.withdrawals).toBeNull();
    expect(mixed.net).toBeNull();
  });

  it("says which currencies it found, so a caller with rates can convert", () => {
    expect(mixed.currency).toBeNull();
    expect(mixed.currencies).toEqual(["EUR", "USD"]);
  });

  it("still reports the dates, which are currency-free", () => {
    expect(mixed.first).not.toBeNull();
    expect(mixed.last).not.toBeNull();
  });

  it("refuses a growth breakdown built on a total that does not exist", () => {
    // The failure mode this replaces: 1800 subtracted from a euro balance and
    // presented as a gain, with a euro sign in front of it.
    expect(growthBreakdown(2000, mixed)).toBeNull();
  });

  it("totals normally once every flow is in one currency", () => {
    const same = summariseCashFlows([flow("DEPOSIT", 1000, "USD"), flow("WITHDRAWAL", -200, "USD")]);
    expect(same.deposits).toBe(1000);
    expect(same.withdrawals).toBe(200);
    expect(same.net).toBe(800);
    expect(same.currency).toBe("USD");
  });
});

/** A single-currency summary, for the growth tests that only care about totals. */
function single(f: { deposits: number; withdrawals: number; net: number }): CashFlowSummary {
  return { ...f, currency: "EUR", currencies: ["EUR"], first: null, last: null };
}

describe("noticing that the statement doesn't start at the beginning", () => {
  it("spots it in the real file", () => {
    // €260 in, €306 out. A broker doesn't let you spend what you never had,
    // so money was in this account before the first row — and calling the
    // opening balance zero would invent a gain out of the missing history.
    const { events } = parseBrokerCsv(REAL);
    const check = checkOpeningBalance(events);
    expect(check.needsOpeningBalance).toBe(true);
    expect(check.impliedOpening).toBeGreaterThan(0);
  });

  it("says the least the account must have held", () => {
    const { events } = parseBrokerCsv(
      "date,type,amount\n2026-01-01,WITHDRAWAL,-50\n2026-01-02,DEPOSIT,10"
    );
    expect(checkOpeningBalance(events).impliedOpening).toBe(50);
  });

  it("is happy with a statement that starts from nothing", () => {
    const { events } = parseBrokerCsv(
      "date,type,amount\n2026-01-01,DEPOSIT,100\n2026-01-02,BUY,-40\n2026-01-03,WITHDRAWAL,-20"
    );
    expect(checkOpeningBalance(events).needsOpeningBalance).toBe(false);
  });

  it("counts fees against the balance", () => {
    const { events } = parseBrokerCsv(
      "date,type,amount,fees\n2026-01-01,DEPOSIT,100,0\n2026-01-02,BUY,-100,5"
    );
    expect(checkOpeningBalance(events).impliedOpening).toBe(5);
  });

  it("reads the rows in date order, whatever order they came in", () => {
    // The real file has its dividends appended after the interest rows, out of
    // sequence. Walking the balance in file order would report a phantom hole.
    const { events } = parseBrokerCsv(
      "date,type,amount\n2026-06-01,WITHDRAWAL,-50\n2026-01-01,DEPOSIT,100"
    );
    expect(checkOpeningBalance(events).needsOpeningBalance).toBe(false);
  });

  it("is quiet about an empty statement", () => {
    expect(checkOpeningBalance([]).needsOpeningBalance).toBe(false);
  });
});

describe("what the statement can say about the past", () => {
  const { events } = parseBrokerCsv(REAL);
  const history = cumulativeHistory(events);

  it("reaches back to the first entry, not to when syncing started", () => {
    // The value chart begins in August because that's when snapshots begin.
    // This is the part of the year the statement can actually account for.
    expect(history[0].date).toBe("2026-01-08");
    expect(history[history.length - 1].date).toBe("2026-07-29");
  });

  it("has one point per day that had activity", () => {
    const dates = history.map((h) => h.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toEqual([...dates].sort());
  });

  it("tracks money committed, not money spent on positions", () => {
    // Buying doesn't add money to the account, it changes its shape.
    const last = history[history.length - 1];
    expect(last.contributed).toBe(-46);
  });

  it("tracks the cost of what was bought", () => {
    const last = history[history.length - 1];
    expect(last.investedAtCost).toBeGreaterThan(0);
  });

  it("accumulates the income actually received", () => {
    const last = history[history.length - 1];
    // 3 dividends and 65 interest payments, all small.
    expect(last.incomeReceived).toBeGreaterThan(0);
    expect(last.incomeReceived).toBeLessThan(5);
  });

  it("only ever moves forward in time", () => {
    for (let i = 1; i < history.length; i++) {
      expect(history[i].date > history[i - 1].date).toBe(true);
    }
  });

  it("treats a sale as removing cost, not as adding profit", () => {
    // Profit needs a cost-basis method; this line is cost and stays cost.
    const { events: e } = parseBrokerCsv(
      "date,type,amount\n2026-01-01,BUY,-100\n2026-02-01,SELL,150"
    );
    const h = cumulativeHistory(e);
    expect(h[h.length - 1].investedAtCost).toBe(-50);
  });

  it("says nothing about an empty statement", () => {
    expect(cumulativeHistory([])).toEqual([]);
  });

  it("never claims to know what anything was worth", () => {
    // The line this refuses to draw: a statement has prices paid, not prices
    // on any later day. A value series would be invented.
    const point = history[0] as unknown as Record<string, unknown>;
    expect(point).not.toHaveProperty("portfolioValue");
    expect(point).not.toHaveProperty("marketValue");
  });
});

describe("recognising a type", () => {
  it("accepts the words brokers actually use", () => {
    expect(normaliseKind("Market buy")).toBe("BUY");
    expect(normaliseKind("LIMIT SELL")).toBe("SELL");
    expect(normaliseKind("Interest on cash")).toBe("INTEREST");
    expect(normaliseKind("Deposit")).toBe("DEPOSIT");
  });

  it("refuses to guess at one it doesn't know", () => {
    expect(normaliseKind("Corporate action")).toBeNull();
    expect(normaliseKind("")).toBeNull();
  });
});

describe("rejecting rows instead of repairing them", () => {
  const header = "date,type,symbol,quantity,price,amount,fees,currency,description,external_id";

  it("rejects a row with an unreadable date, naming the line", () => {
    const { events, rejected } = parseBrokerCsv(`${header}\nnot-a-date,BUY,X,1,1,-1,,EUR,,1`);
    expect(events).toHaveLength(0);
    expect(rejected[0].line).toBe(2);
    expect(rejected[0].reason).toMatch(/date/i);
  });

  it("rejects an unknown type rather than filing it as something else", () => {
    const { rejected } = parseBrokerCsv(`${header}\n2026-01-01,SPLIT,X,1,1,0,,EUR,,1`);
    expect(rejected[0].reason).toMatch(/unknown type/i);
  });

  it("rejects a row with no amount", () => {
    const { rejected } = parseBrokerCsv(`${header}\n2026-01-01,BUY,X,1,1,,,EUR,,1`);
    expect(rejected[0].reason).toMatch(/amount/i);
  });

  it("keeps the good rows when one is bad", () => {
    const { events, rejected } = parseBrokerCsv(
      `${header}\n2026-01-01,BUY,X,1,1,-1,,EUR,,1\nbad,BUY,X,1,1,-1,,EUR,,2`
    );
    expect(events).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("refuses a file that isn't a statement at all", () => {
    expect(() => parseBrokerCsv("name,email\nJoão,a@b.c")).toThrow(/broker statement/i);
  });

  it("survives an empty file", () => {
    expect(parseBrokerCsv("")).toEqual({ events: [], rejected: [] });
  });

  it("reads columns by name, not by position", () => {
    // A column moving must not shift every value one to the left.
    const { events } = parseBrokerCsv("type,amount,date\nDEPOSIT,50,2026-01-01");
    expect(events[0].amount).toBe(50);
    expect(events[0].kind).toBe("DEPOSIT");
  });
});

describe("not counting the same payment twice", () => {
  it("uses the platform's id when there is one", () => {
    const key = naturalKey({
      date: new Date("2026-02-03"),
      kind: "BUY",
      symbol: "IGLA",
      amount: -5.04,
      externalId: "46024759075",
    });
    expect(key).toBe("id:46024759075");
  });

  it("falls back to date, kind, symbol and amount", () => {
    const a = naturalKey({ date: new Date("2026-06-30"), kind: "DIVIDEND", symbol: "IPRP", amount: 0.42 });
    const b = naturalKey({ date: new Date("2026-06-30"), kind: "DIVIDEND", symbol: "iprp", amount: 0.42 });
    expect(a).toBe(b);
  });

  it("tells two different payments apart", () => {
    const a = naturalKey({ date: new Date("2026-01-28"), kind: "DIVIDEND", symbol: "EUN3", amount: 0.08 });
    const b = naturalKey({ date: new Date("2026-07-29"), kind: "DIVIDEND", symbol: "EUN3", amount: 0.08 });
    expect(a).not.toBe(b);
  });

  it("matches the same dividend arriving from the API and from the file", () => {
    // The API sync and an imported statement both carry this payment. Counted
    // twice, it would overstate the income by exactly one dividend.
    const fromApi = naturalKey({ date: new Date("2026-06-30T00:00:00Z"), kind: "DIVIDEND", symbol: "IPRP", amount: 0.42 });
    const fromCsv = naturalKey({ date: new Date("2026-06-30"), kind: "DIVIDEND", symbol: "IPRP", amount: 0.42 });
    expect(fromApi).toBe(fromCsv);
  });
});

describe("matching a statement symbol to a platform ticker", () => {
  const tickers = ["IGLAI_EQ", "MVOLI_EQ", "IPRPa_EQ", "PHAGa_EQ", "EGLNI_EQ", "EUN3d_EQ"];

  it("matches the shortened symbol the export uses", () => {
    expect(matchTicker("IGLA", tickers)).toBe("IGLAI_EQ");
    expect(matchTicker("EUN3", tickers)).toBe("EUN3d_EQ");
  });

  it("matches every symbol in the real statement", () => {
    const { events } = parseBrokerCsv(REAL);
    const symbols = [...new Set(events.map((e) => e.symbol).filter((s): s is string => s !== null))];
    for (const s of symbols) {
      expect(matchTicker(s, tickers), `${s} matched nothing`).not.toBeNull();
    }
  });

  it("takes an exact match over a prefix", () => {
    expect(matchTicker("ABC", ["ABC", "ABCD"])).toBe("ABC");
  });

  it("refuses an ambiguous prefix rather than picking one", () => {
    // Attaching a dividend to the wrong instrument is worse than leaving it
    // unattached, and far harder to notice.
    expect(matchTicker("AB", ["ABC_EQ", "ABD_EQ"])).toBeNull();
  });

  it("returns null for a symbol that matches nothing", () => {
    expect(matchTicker("ZZZZ", tickers)).toBeNull();
    expect(matchTicker("", tickers)).toBeNull();
  });
});
