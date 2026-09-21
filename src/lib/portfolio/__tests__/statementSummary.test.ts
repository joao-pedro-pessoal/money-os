import { describe, expect, it } from "vitest";
import { statementHistory, summariseStatement } from "../statementSummary";
import { reconstructHoldings } from "../reconstruct";
import { cumulativeHistory, type BrokerEvent } from "../../csv/broker";

type Row = Partial<BrokerEvent> & { isin?: string | null };

function ev(row: Row): BrokerEvent & { isin?: string | null } {
  return {
    date: new Date("2026-01-01"),
    kind: "BUY",
    symbol: "IWDA",
    isin: null,
    quantity: 1,
    price: 100,
    amount: -100,
    fees: null,
    currency: "EUR",
    description: null,
    externalId: null,
    line: 1,
    ...row,
  };
}

/** Per 1 EUR, as the provider quotes. No GBP: the currency with no rate. */
const rates = { EUR: 1, USD: 1.25 };

const euros = [
  ev({ kind: "DEPOSIT", symbol: null, amount: 500, quantity: null, price: null }),
  ev({ amount: -300, quantity: 3, fees: 1 }),
  ev({ kind: "INTEREST", symbol: null, amount: 1.5, quantity: null, price: null, date: new Date("2026-02-01") }),
  ev({ kind: "DIVIDEND", amount: 2, quantity: null, price: null, date: new Date("2026-03-01") }),
];

const dollars = [
  ev({ kind: "DEPOSIT", symbol: null, amount: 250, quantity: null, price: null, currency: "USD" }),
  ev({ symbol: "AAPL", amount: -125, quantity: 1, currency: "USD" }),
  ev({ kind: "DIVIDEND", symbol: "AAPL", amount: 2.5, quantity: null, price: null, currency: "USD" }),
];

describe("a statement in one currency", () => {
  /** Every statement imported so far: nothing is converted, nothing changes. */
  it("adds up exactly as before, in its own currency", () => {
    const s = summariseStatement(euros, rates, "EUR", null);
    const rebuilt = reconstructHoldings(euros);
    expect(s.currency).toBe("EUR");
    expect(s.converted).toBe(false);
    expect(s.stillInvested).toBe(rebuilt.totalCostBasis);
    expect(s.flows).toEqual({ deposits: 500, withdrawals: 0, net: 500 });
    expect(s.interest.total).toBe(1.5);
    expect(s.dividends.total).toBe(2);
    expect(s.fees).toBe(1);
  });

  /** A dollar statement is exact in dollars; converting it would only lose that. */
  it("stays in its own currency when that is not the base", () => {
    const s = summariseStatement(dollars, rates, "EUR", null);
    expect(s.currency).toBe("USD");
    expect(s.converted).toBe(false);
    expect(s.stillInvested).toBe(125);
  });
});

describe("a statement in two currencies", () => {
  /**
   * "Still invested, at cost" used to be 301 euros plus 125 dollars, read as
   * 426 of whichever currency the first row was in.
   */
  it("adds each currency on its own, then converts, rather than adding euros to dollars", () => {
    const s = summariseStatement([...euros, ...dollars], rates, "EUR", null);
    expect(s.currency).toBe("EUR");
    expect(s.converted).toBe(true);
    expect(s.stillInvested).toBe(401); // 301 € + 125 $ at 1.25
    expect(s.flows.deposits).toBe(700); // 500 € + 250 $
    expect(s.dividends.total).toBe(4); // 2 € + 2.50 $
  });

  it("keeps each instrument and payment in the currency it was in", () => {
    const s = summariseStatement([...euros, ...dollars], rates, "EUR", null);
    expect(s.holdings.map((h) => [h.key, h.currency, h.costBasis])).toEqual([
      ["IWDA", "EUR", 301],
      ["AAPL", "USD", 125],
    ]);
    expect(s.dividends.payments.map((p) => p.currency).sort()).toEqual(["EUR", "USD"]);
  });

  it("leaves a currency with no rate out of every total, names it, and keeps its instruments", () => {
    const pounds = [ev({ symbol: "VOD", amount: -80, quantity: 10, currency: "GBP" })];
    const s = summariseStatement([...euros, ...pounds], rates, "EUR", null);
    expect(s.unconverted).toEqual(["GBP"]);
    expect(s.stillInvested).toBe(301);
    expect(s.holdings.find((h) => h.key === "VOD")?.currency).toBe("GBP");
  });
});

describe("the gain against cost", () => {
  it("is value minus cost, with the declaration converted into the totals' currency", () => {
    const s = summariseStatement([...euros, ...dollars], rates, "EUR", [{ amount: 500, currency: "USD" }]);
    expect(s.gain?.value).toBe(400);
    expect(s.gain?.unrealized).toBe(-1);
  });

  /** Against part of the cost, the gain would be invented. */
  it("is not stated when the cost leaves a currency out, or a declaration cannot be converted", () => {
    const pounds = [ev({ symbol: "VOD", amount: -80, quantity: 10, currency: "GBP" })];
    expect(summariseStatement([...euros, ...pounds], rates, "EUR", [{ amount: 400, currency: "EUR" }]).gain).toBeNull();
    expect(summariseStatement(euros, rates, "EUR", [{ amount: 400, currency: "GBP" }]).gain).toBeNull();
  });

  it("is not stated when no account declares a value", () => {
    expect(summariseStatement(euros, rates, "EUR", null).gain).toBeNull();
  });
});

describe("the statement's history", () => {
  it("is the same lines as before for one currency", () => {
    expect(statementHistory(euros, rates, "EUR")).toEqual({
      history: cumulativeHistory(euros),
      currency: "EUR",
      converted: false,
      unconverted: [],
    });
  });

  it("converts each row before adding it when there are several, and names what it left out", () => {
    const pounds = [ev({ symbol: "VOD", amount: -80, quantity: 10, currency: "GBP" })];
    const h = statementHistory([...euros, ...dollars, ...pounds], rates, "EUR");
    expect(h.converted).toBe(true);
    expect(h.unconverted).toEqual(["GBP"]);
    expect(h.history[h.history.length - 1].contributed).toBe(700);
  });
});
