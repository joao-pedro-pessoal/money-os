import { describe, it, expect } from "vitest";
import {
  reconstructHoldings,
  compareWithReported,
  instrumentKey,
  gainAgainstCost,
  type CostBasisMethod,
} from "../reconstruct";
import type { BrokerEvent } from "../../csv/broker";

type Row = Partial<BrokerEvent> & { isin?: string | null };

/** A statement row, with everything irrelevant to the case already filled in. */
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

describe("identifying an instrument", () => {
  it("prefers the ISIN, because a ticker is not unique", () => {
    // The same fund trades as IWDA in Amsterdam and SWDA in London. The same
    // ticker can also mean two different companies in two countries. Keying on
    // the symbol would either split one holding or merge two.
    expect(instrumentKey({ isin: "IE00B4L5Y983", symbol: "IWDA" })).toBe("IE00B4L5Y983");
    expect(instrumentKey({ isin: null, symbol: "IWDA" })).toBe("IWDA");
    expect(instrumentKey({ isin: "  ie00b4l5y983 ", symbol: null })).toBe("IE00B4L5Y983");
  });

  it("returns null for a row about cash rather than an instrument", () => {
    expect(instrumentKey({ isin: null, symbol: null })).toBeNull();
    expect(instrumentKey({ isin: "", symbol: "   " })).toBeNull();
  });
});

describe("rebuilding a holding", () => {
  it("is buys minus sells, to the share", () => {
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 10, amount: -1000, date: new Date("2026-01-05") }),
      ev({ kind: "BUY", quantity: 5, amount: -600, date: new Date("2026-02-05") }),
      ev({ kind: "SELL", quantity: 3, amount: 400, date: new Date("2026-03-05") }),
    ]);

    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(12);
  });

  it("counts fees as part of what the shares cost", () => {
    // Defensible either way, which is exactly why it's asserted: someone
    // reconciling this against a tax figure needs to know which was chosen.
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 10, amount: -1000, fees: 5 }),
    ]);

    expect(holdings[0].costBasis).toBe(1005);
    expect(holdings[0].averageCost).toBeCloseTo(100.5, 8);
    expect(holdings[0].feesPaid).toBe(5);
  });

  it("leaves nothing behind when the position is closed", () => {
    // Floating point makes 10 - 3 - 7 land near zero rather than on it, and
    // "0.0000000000001 shares" in a holdings list is how you lose trust in a
    // page that is otherwise right.
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 10, amount: -1000 }),
      ev({ kind: "SELL", quantity: 3, amount: 330 }),
      ev({ kind: "SELL", quantity: 7, amount: 770 }),
    ]);

    expect(holdings[0].quantity).toBe(0);
    expect(holdings[0].costBasis).toBe(0);
    expect(holdings[0].averageCost).toBeNull();
  });

  it("keeps instruments apart by ISIN even when the symbol repeats", () => {
    const { holdings } = reconstructHoldings([
      ev({ isin: "IE00B4L5Y983", symbol: "IWDA", quantity: 2, amount: -200 }),
      ev({ isin: "IE00BK5BQT80", symbol: "IWDA", quantity: 3, amount: -300 }),
    ]);

    expect(holdings).toHaveLength(2);
    expect(holdings.map((h) => h.key).sort()).toEqual(["IE00BK5BQT80", "IE00B4L5Y983"].sort());
  });

  it("ignores deposits and cash interest, which belong to no instrument", () => {
    const { holdings } = reconstructHoldings([
      ev({ kind: "DEPOSIT", symbol: null, isin: null, quantity: null, amount: 500 }),
      ev({ kind: "INTEREST", symbol: null, isin: null, quantity: null, amount: 1.2 }),
      ev({ kind: "BUY", quantity: 4, amount: -400 }),
    ]);

    expect(holdings).toHaveLength(1);
    expect(holdings[0].symbol).toBe("IWDA");
  });

  it("attributes a dividend to the instrument that paid it", () => {
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 10, amount: -1000 }),
      ev({ kind: "DIVIDEND", quantity: null, amount: 4.2 }),
    ]);

    expect(holdings[0].incomeReceived).toBe(4.2);
    // Income is not profit on the shares, and must not quietly become it.
    expect(holdings[0].realizedPnl).toBe(0);
  });
});

describe("realised profit", () => {
  it("is the sale proceeds minus what those shares cost", () => {
    const { holdings, totalRealizedPnl } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 10, amount: -1000 }),
      ev({ kind: "SELL", quantity: 4, amount: 480 }),
    ]);

    // 4 shares cost 400, sold for 480.
    expect(holdings[0].realizedPnl).toBe(80);
    expect(totalRealizedPnl).toBe(80);
  });

  it("says outright that it is this app's number, not the broker's", () => {
    // Trading 212 publishes its own realised P&L and the connector reports that
    // one. This is derived. The two must never be presented as the same claim,
    // so the flag is part of the result rather than a comment.
    const result = reconstructHoldings([ev({})]);
    expect(result.realizedPnlIsComputed).toBe(true);
    expect(result.method).toBe("average");
  });

  it("differs between average cost and FIFO, and says which was used", () => {
    const events = [
      ev({ kind: "BUY", quantity: 10, amount: -100, date: new Date("2026-01-01") }), // 10 each
      ev({ kind: "BUY", quantity: 10, amount: -300, date: new Date("2026-02-01") }), // 30 each
      ev({ kind: "SELL", quantity: 10, amount: 400, date: new Date("2026-03-01") }), // 40 each
    ];

    const average = reconstructHoldings(events, "average");
    const fifo = reconstructHoldings(events, "fifo");

    // Average: 10 shares at 20 = 200 cost, sold for 400 → 200 profit.
    expect(average.holdings[0].realizedPnl).toBe(200);
    // FIFO: the oldest 10 cost 100, sold for 400 → 300 profit.
    expect(fifo.holdings[0].realizedPnl).toBe(300);

    expect(average.method).toBe("average");
    expect(fifo.method).toBe("fifo");
  });
});

describe("a statement that doesn't reach the beginning", () => {
  it("refuses to invent profit from shares it never saw bought", () => {
    // This is the Trading 212 case: the export starts partway through, so a
    // sale can appear with no matching purchase. Booking the whole sale as
    // profit would be the single most flattering possible lie.
    const { holdings } = reconstructHoldings([ev({ kind: "SELL", quantity: 5, amount: 750 })]);

    expect(holdings[0].realizedPnl).toBe(0);
    expect(holdings[0].incomplete).toBe(true);
    expect(holdings[0].reasons.join(" ")).toMatch(/starts partway through/i);
  });

  it("never lets a holding go negative", () => {
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 2, amount: -200 }),
      ev({ kind: "SELL", quantity: 9, amount: 900 }),
    ]);

    // A holding of −7 shares would be subtracted from the portfolio total and
    // poison every figure above it.
    expect(holdings[0].quantity).toBe(0);
    expect(holdings[0].incomplete).toBe(true);
  });

  it("prices only the part of a sale it can account for", () => {
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 5, amount: -500 }), // 100 each
      ev({ kind: "SELL", quantity: 10, amount: 1500 }), // 150 each, but only 5 are ours
    ]);

    // Half the sale is explainable: 5 shares that cost 500, sold for 750.
    expect(holdings[0].realizedPnl).toBe(250);
    expect(holdings[0].incomplete).toBe(true);
  });

  it("flags a row that omits the quantity instead of guessing one", () => {
    const { holdings, incomplete } = reconstructHoldings([
      ev({ kind: "BUY", quantity: null, amount: -300 }),
    ]);

    expect(incomplete).toHaveLength(1);
    expect(holdings[0].reasons.join(" ")).toMatch(/didn't say how many/i);
  });
});

/**
 * Properties over generated sequences.
 *
 * Every hand-written case above passed on an earlier version of this file that
 * still got the average wrong after a partial sale. Examples test what you
 * thought of; these test what you didn't.
 */
describe("properties", () => {
  /** Deterministic pseudo-random, so a failure is reproducible. */
  function rng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  function sequence(seed: number, length: number) {
    const r = rng(seed);
    const events: (BrokerEvent & { isin?: string | null })[] = [];
    let held = 0;

    for (let i = 0; i < length; i++) {
      const day = new Date(2026, 0, 1 + i);
      const buying = held < 1 || r() < 0.6;
      const quantity = Math.round((r() * 10 + 1) * 100) / 100;
      const price = Math.round((r() * 90 + 10) * 100) / 100;

      if (buying) {
        held += quantity;
        events.push(ev({ kind: "BUY", quantity, price, amount: -(quantity * price), date: day }));
      } else {
        const q = Math.min(held, quantity);
        held -= q;
        events.push(ev({ kind: "SELL", quantity: q, price, amount: q * price, date: day }));
      }
    }
    return events;
  }

  const methods: CostBasisMethod[] = ["average", "fifo"];

  it.each(methods)("never reports a negative quantity or cost (%s)", (method) => {
    for (let seed = 1; seed <= 60; seed++) {
      const { holdings } = reconstructHoldings(sequence(seed, 25), method);
      for (const h of holdings) {
        expect(h.quantity).toBeGreaterThanOrEqual(0);
        expect(h.costBasis).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it.each(methods)("conserves cost: what's left plus what was sold is what was spent (%s)", (method) => {
    for (let seed = 1; seed <= 60; seed++) {
      const events = sequence(seed, 25);
      const { holdings } = reconstructHoldings(events, method);
      if (holdings.length === 0) continue;

      const spent = events
        .filter((e) => e.kind === "BUY")
        .reduce((s, e) => s + Math.abs(e.amount) + (e.fees ?? 0), 0);
      const proceeds = events
        .filter((e) => e.kind === "SELL")
        .reduce((s, e) => s + Math.abs(e.amount) - (e.fees ?? 0), 0);

      // costOfSold = proceeds − realised, and cost is either still held or sold.
      const costOfSold = proceeds - holdings[0].realizedPnl;

      // Tolerance stated outright rather than as a `toBeCloseTo` digit, because
      // it isn't arbitrary: cost basis and realised P&L are each rounded to the
      // cent on the way out, so the identity can be off by up to half a cent
      // twice over and no more. A failure outside 0.01 would be real money
      // going missing; anything inside it is the rounding this app does on
      // purpose. Both earlier attempts at this line were the test being wrong,
      // not the code.
      expect(Math.abs(holdings[0].costBasis + costOfSold - spent)).toBeLessThanOrEqual(0.0101);
    }
  });

  it.each(methods)("does not depend on the order rows arrive in (%s)", (method) => {
    for (let seed = 1; seed <= 40; seed++) {
      const events = sequence(seed, 20);
      const shuffled = [...events].reverse();

      const a = reconstructHoldings(events, method);
      const b = reconstructHoldings(shuffled, method);

      expect(b.holdings[0]?.quantity).toBeCloseTo(a.holdings[0]?.quantity ?? 0, 8);
      expect(b.holdings[0]?.realizedPnl).toBeCloseTo(a.holdings[0]?.realizedPnl ?? 0, 4);
    }
  });

  it("agrees between methods once every share has been sold", () => {
    // While shares are held the two methods legitimately disagree. Once the
    // position is closed the total profit is just proceeds minus cost, and a
    // method that still disagreed there would be losing or inventing money.
    for (let seed = 1; seed <= 40; seed++) {
      const events = sequence(seed, 16);
      const held = reconstructHoldings(events, "average").holdings[0]?.quantity ?? 0;
      if (held <= 0) continue;

      const closeOut = ev({
        kind: "SELL",
        quantity: held,
        amount: held * 55,
        date: new Date(2026, 6, 1),
      });

      const average = reconstructHoldings([...events, closeOut], "average");
      const fifo = reconstructHoldings([...events, closeOut], "fifo");

      expect(average.holdings[0].quantity).toBe(0);
      expect(fifo.holdings[0].quantity).toBe(0);
      expect(fifo.totalRealizedPnl).toBeCloseTo(average.totalRealizedPnl, 4);
    }
  });

  it("agrees between methods when every purchase was at the same price", () => {
    const events = [
      ev({ kind: "BUY", quantity: 5, amount: -250, date: new Date("2026-01-01") }),
      ev({ kind: "BUY", quantity: 5, amount: -250, date: new Date("2026-02-01") }),
      ev({ kind: "SELL", quantity: 6, amount: 420, date: new Date("2026-03-01") }),
    ];

    expect(reconstructHoldings(events, "fifo").totalRealizedPnl).toBeCloseTo(
      reconstructHoldings(events, "average").totalRealizedPnl,
      6
    );
  });
});

describe("unrealised gain without a single market price", () => {
  it("is what the account is worth minus what it cost", () => {
    // The insight this was built from: a statement knows the cost, an account
    // that declares its value knows the rest, and the subtraction is exact.
    // No quote source, nothing to go stale, no per-instrument guesswork.
    const gain = gainAgainstCost(450.83, 424.69);

    expect(gain?.value).toBe(450.83);
    expect(gain?.cost).toBe(424.69);
    expect(gain?.unrealized).toBe(26.14);
    // 26.14 / 424.69 = 6.1551…, rounded to the cent like every other
    // percentage in this app.
    expect(gain?.unrealizedPercent).toBe(6.16);
  });

  it("reports a loss as readily as a gain", () => {
    expect(gainAgainstCost(400, 424.69)?.unrealized).toBe(-24.69);
  });

  it("says nothing when the account hasn't declared a value", () => {
    // Zero would be a claim that it hasn't moved. Null is the absence of one.
    expect(gainAgainstCost(null, 424.69)).toBeNull();
    expect(gainAgainstCost(undefined, 424.69)).toBeNull();
  });

  it("declines a percentage of nothing", () => {
    const gain = gainAgainstCost(50, 0);
    expect(gain?.unrealized).toBe(50);
    expect(gain?.unrealizedPercent).toBeNull();
  });

  it("admits it cannot split the figure across instruments", () => {
    // Spreading it pro rata would put a fabricated number on every row of a
    // table whose other columns are facts.
    expect(gainAgainstCost(500, 400)?.perInstrumentUnknown).toBe(true);
  });
});

describe("comparing against what the platform reports", () => {
  it("spots a purchase made since the last export", () => {
    // The whole point: the statement is a photograph, and this notices the
    // world has moved on since it was taken.
    const { holdings } = reconstructHoldings([ev({ kind: "BUY", quantity: 10, amount: -1000 })]);

    const drift = compareWithReported(holdings, [
      { key: "IWDA", symbol: "IWDA", quantity: 14 },
    ]);

    expect(drift).toHaveLength(1);
    expect(drift[0].difference).toBe(-4);
  });

  it("stays quiet about rounding-sized differences", () => {
    const { holdings } = reconstructHoldings([
      ev({ kind: "BUY", quantity: 10, amount: -1000 }),
    ]);

    expect(
      compareWithReported(holdings, [{ key: "IWDA", symbol: "IWDA", quantity: 10.000001 }])
    ).toEqual([]);
  });

  it("reports an instrument the platform knows nothing about", () => {
    const { holdings } = reconstructHoldings([ev({ kind: "BUY", quantity: 3, amount: -300 })]);

    const drift = compareWithReported(holdings, []);
    expect(drift[0]).toMatchObject({ key: "IWDA", reconstructed: 3, reported: 0 });
  });
});
