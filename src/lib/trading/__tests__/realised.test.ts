import { describe, it, expect } from "vitest";
import { deriveRealisedPnl, realisedProvenance } from "../realised";
import { isCurrencyConversion, isInstrumentTrade, type TradeRow } from "../stats";

const row = (over: Partial<TradeRow> = {}): TradeRow => ({
  date: "2026-08-12T10:00:00.000Z",
  type: "BUY",
  symbol: "FEMY",
  quantity: 3.465,
  amount: -7.85,
  fees: null,
  realizedPnl: null,
  description: null,
  ...over,
});

/**
 * IBKR books an FX conversion as a buy or a sell of `EUR.USD`, so holding a
 * dollar stock in a euro account produces a stream of them. On the live account
 * `EUR.USD` was the most "traded" instrument in the app — seventeen rows, more
 * than any real position.
 */
describe("a currency conversion is not a trade", () => {
  it("recognises the pair IBKR writes", () => {
    expect(isCurrencyConversion("EUR.USD")).toBe(true);
    expect(isCurrencyConversion("USD.JPY")).toBe(true);
    expect(isCurrencyConversion("eur.usd")).toBe(true);
    expect(isCurrencyConversion("GBP/USD")).toBe(true);
  });

  /**
   * The case a "contains a dot" rule destroys. `BRK.B` is Berkshire Hathaway
   * class B — a real ticker with a dot in it — and `B` is not a currency, so
   * requiring both halves to be currency codes leaves it alone.
   */
  it("leaves a real ticker that happens to contain a dot", () => {
    expect(isCurrencyConversion("BRK.B")).toBe(false);
    expect(isCurrencyConversion("RDS.A")).toBe(false);
  });

  it("is false for an ordinary symbol, an empty one, and nothing", () => {
    expect(isCurrencyConversion("FEMY")).toBe(false);
    expect(isCurrencyConversion("")).toBe(false);
    expect(isCurrencyConversion(null)).toBe(false);
    // Three parts is not a pair.
    expect(isCurrencyConversion("EUR.USD.GBP")).toBe(false);
  });

  it("keeps conversions out of what counts as a trade", () => {
    expect(isInstrumentTrade(row({ symbol: "FEMY" }))).toBe(true);
    expect(isInstrumentTrade(row({ symbol: "EUR.USD" }))).toBe(false);
    // A dividend was never a trade to begin with.
    expect(isInstrumentTrade(row({ type: "DIVIDEND", symbol: "AVBC" }))).toBe(false);
  });
});

/**
 * The report that started this. FEMY was bought in full on the 12th and sold in
 * full on the 25th, and the page said "22 trades, none of which has closed a
 * position yet" — because Interactive Brokers states no realised result on any
 * of its 22 rows, and the app only ever read the venue's figure.
 */
describe("deriving a result the venue does not state", () => {
  const FEMY = [
    row({ date: "2026-08-12T10:00:00.000Z", type: "BUY", symbol: "FEMY", quantity: 3.465, amount: -7.85 }),
    row({ date: "2026-08-25T10:00:00.000Z", type: "SELL", symbol: "FEMY", quantity: 3.465, amount: 8.62 }),
  ];

  it("closes the position and reports what it made", () => {
    const [, sale] = deriveRealisedPnl(FEMY);
    expect(sale.realizedPnl).toBeCloseTo(0.77, 2);
    expect(sale.pnlDerived).toBe(true);
  });

  it("leaves the opening trade without a result, because it closed nothing", () => {
    const [buy] = deriveRealisedPnl(FEMY);
    expect(buy.realizedPnl).toBeNull();
    expect(buy.pnlDerived).toBe(false);
  });

  it("handles a partial sale at average cost", () => {
    const rows = deriveRealisedPnl([
      row({ date: "2026-01-01T00:00:00.000Z", type: "BUY", symbol: "X", quantity: 10, amount: -100 }),
      row({ date: "2026-02-01T00:00:00.000Z", type: "SELL", symbol: "X", quantity: 4, amount: 60 }),
    ]);
    // Cost 10 each; sold 4 for 60, which cost 40.
    expect(rows[1].realizedPnl).toBeCloseTo(20, 6);
  });

  it("averages across purchases made at different prices", () => {
    const rows = deriveRealisedPnl([
      row({ date: "2026-01-01T00:00:00.000Z", type: "BUY", symbol: "X", quantity: 10, amount: -100 }),
      row({ date: "2026-01-15T00:00:00.000Z", type: "BUY", symbol: "X", quantity: 10, amount: -300 }),
      row({ date: "2026-02-01T00:00:00.000Z", type: "SELL", symbol: "X", quantity: 10, amount: 250 }),
    ]);
    // 400 for 20 units is 20 each; ten sold for 250 cost 200.
    expect(rows[2].realizedPnl).toBeCloseTo(50, 6);
  });

  /**
   * The venue always wins. Mixing a broker's published figure with one derived
   * here inside a single instrument's total produces a number belonging to
   * neither method — CLAUDE.md's rule that the two are different kinds of
   * claim.
   */
  it("never derives for a symbol the venue already reports on", () => {
    const rows = deriveRealisedPnl([
      row({ date: "2026-01-01T00:00:00.000Z", type: "BUY", symbol: "HYPE", quantity: 10, amount: -100 }),
      row({
        date: "2026-02-01T00:00:00.000Z",
        type: "SELL",
        symbol: "HYPE",
        quantity: 10,
        amount: 250,
        realizedPnl: 140,
      }),
    ]);
    expect(rows[1].realizedPnl).toBe(140);
    expect(rows[1].pnlDerived).toBe(false);
  });

  /**
   * The feed reaches back only as far as the import does. Pricing a sale
   * against a cost of zero would report the whole proceeds as profit, which is
   * the most flattering possible lie.
   */
  it("leaves a sale with nothing bought before it alone", () => {
    const rows = deriveRealisedPnl([
      row({ date: "2026-02-01T00:00:00.000Z", type: "SELL", symbol: "OLD", quantity: 5, amount: 500 }),
    ]);
    expect(rows[0].realizedPnl).toBeNull();
    expect(rows[0].pnlDerived).toBe(false);
  });

  it("stops deriving once the position is exhausted", () => {
    const rows = deriveRealisedPnl([
      row({ date: "2026-01-01T00:00:00.000Z", type: "BUY", symbol: "X", quantity: 5, amount: -50 }),
      row({ date: "2026-02-01T00:00:00.000Z", type: "SELL", symbol: "X", quantity: 5, amount: 60 }),
      row({ date: "2026-03-01T00:00:00.000Z", type: "SELL", symbol: "X", quantity: 5, amount: 60 }),
    ]);
    expect(rows[1].realizedPnl).toBeCloseTo(10, 6);
    // Nothing left to sell: no result rather than another ten.
    expect(rows[2].realizedPnl).toBeNull();
  });

  it("never derives a result for a currency conversion", () => {
    const rows = deriveRealisedPnl([
      row({ date: "2026-01-01T00:00:00.000Z", type: "BUY", symbol: "EUR.USD", quantity: 100, amount: -100 }),
      row({ date: "2026-02-01T00:00:00.000Z", type: "SELL", symbol: "EUR.USD", quantity: 100, amount: 105 }),
    ]);
    expect(rows.every((r) => r.realizedPnl === null)).toBe(true);
    expect(rows.every((r) => !r.pnlDerived)).toBe(true);
  });

  it("processes in date order whatever order the rows arrive in", () => {
    const shuffled = deriveRealisedPnl([
      row({ date: "2026-02-01T00:00:00.000Z", type: "SELL", symbol: "X", quantity: 10, amount: 150 }),
      row({ date: "2026-01-01T00:00:00.000Z", type: "BUY", symbol: "X", quantity: 10, amount: -100 }),
    ]);
    // The sale is still the row that carries the result, and the cost still
    // comes from the purchase that preceded it in time.
    expect(shuffled[0].realizedPnl).toBeCloseTo(50, 6);
    expect(shuffled[1].realizedPnl).toBeNull();
  });

  it("returns every row it was given, in the order it was given", () => {
    const input = [row({ symbol: "A" }), row({ symbol: "B" }), row({ symbol: "C" })];
    expect(deriveRealisedPnl(input).map((r) => r.symbol)).toEqual(["A", "B", "C"]);
  });
});

/**
 * The screen has to say which figures are the broker's and which are this
 * app's. A total mixing them without saying so cannot be checked against
 * anything.
 */
describe("saying where each result came from", () => {
  it("counts reported, derived, still-open and excluded separately", () => {
    const rows = deriveRealisedPnl([
      // Reported by the venue.
      row({ date: "2026-01-01T00:00:00.000Z", type: "SELL", symbol: "HYPE", quantity: 1, amount: 10, realizedPnl: 5 }),
      // Derived here.
      row({ date: "2026-01-02T00:00:00.000Z", type: "BUY", symbol: "FEMY", quantity: 3, amount: -9 }),
      row({ date: "2026-01-03T00:00:00.000Z", type: "SELL", symbol: "FEMY", quantity: 3, amount: 12 }),
      // Still open.
      row({ date: "2026-01-04T00:00:00.000Z", type: "BUY", symbol: "CCI", quantity: 1, amount: -8 }),
      // Not a trade at all.
      row({ date: "2026-01-05T00:00:00.000Z", type: "SELL", symbol: "EUR.USD", quantity: 5, amount: 5 }),
    ]);

    expect(realisedProvenance(rows)).toEqual({
      reported: 1,
      derived: 1,
      // The FEMY purchase and the CCI purchase closed nothing.
      open: 2,
      conversions: 1,
    });
  });

  it("has nothing to report about nothing", () => {
    expect(realisedProvenance([])).toEqual({
      reported: 0,
      derived: 0,
      open: 0,
      conversions: 0,
    });
  });
});
