import { describe, it, expect } from "vitest";
import { onlyClosedPositions, type TradeHistoryRow } from "../filter";

const row = (over: Partial<TradeHistoryRow>): TradeHistoryRow => ({
  id: "1",
  date: "2026-06-01T00:00:00.000Z",
  type: "BUY",
  symbol: "IGLA",
  quantity: 1,
  amount: -10,
  fees: null,
  realizedPnl: null,
  description: null,
  accountName: "Trading 212",
  currency: "EUR",
  tags: [],
  ...over,
});

/**
 * A trade history is a record of results. An instrument only ever bought has
 * produced none — it is a holding. Eight buy-only ETFs sat in this table under
 * a Realised column, which is what prompted the rule.
 */
describe("only positions that have closed something", () => {
  it("drops an instrument that was only ever bought", () => {
    const { rows, openInstruments } = onlyClosedPositions([
      row({ symbol: "IGLA" }),
      row({ symbol: "PHAG" }),
    ]);
    expect(rows).toEqual([]);
    expect(openInstruments).toEqual(["IGLA", "PHAG"]);
  });

  /**
   * The test is per instrument, not per row. A buy that a later sale was
   * measured against is what the result was made from, and hiding it would
   * leave a sale explaining nothing.
   */
  it("keeps the opening buys of something that later closed", () => {
    const { rows, openInstruments } = onlyClosedPositions([
      row({ symbol: "FEMY", type: "BUY" }),
      row({ symbol: "FEMY", type: "SELL", realizedPnl: -1.2 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(openInstruments).toEqual([]);
  });

  /** Partially closed is closed enough: the part that closed has a result. */
  it("keeps an instrument still partly held once any of it has closed", () => {
    const { rows } = onlyClosedPositions([
      row({ symbol: "HYPE", type: "BUY", quantity: 2 }),
      row({ symbol: "HYPE", type: "SELL", quantity: 1, realizedPnl: 8 }),
    ]);
    expect(rows).toHaveLength(2);
  });

  /** A short closed by buying back is a closed round trip like any other. */
  it("keeps a short that was closed with a purchase", () => {
    const { rows, openInstruments } = onlyClosedPositions([
      row({ symbol: "SOL", type: "BUY", realizedPnl: -4.05 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(openInstruments).toEqual([]);
  });

  /**
   * Non-trade events follow their instrument. A dividend from something held in
   * full belongs with the holding, not in a record of trading results.
   */
  it("takes an instrument's dividends with it when it goes", () => {
    const { rows } = onlyClosedPositions([
      row({ symbol: "EGLN", type: "BUY" }),
      row({ symbol: "EGLN", type: "DIVIDEND", amount: 0.4 }),
    ]);
    expect(rows).toEqual([]);
  });

  /**
   * A row with no instrument at all — a deposit, a platform fee — is not a
   * position, so it can never be one this calls open.
   */
  it("never drops a row that names no instrument", () => {
    const { rows, openInstruments } = onlyClosedPositions([
      row({ symbol: null, type: "DEPOSIT", amount: 100 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(openInstruments).toEqual([]);
  });

  it("reports each open instrument once, sorted", () => {
    const { openInstruments } = onlyClosedPositions([
      row({ symbol: "PHAG" }),
      row({ symbol: "IGLA" }),
      row({ symbol: "PHAG" }),
    ]);
    expect(openInstruments).toEqual(["IGLA", "PHAG"]);
  });

  it("has nothing to say about an empty history", () => {
    expect(onlyClosedPositions([])).toEqual({ rows: [], openInstruments: [] });
  });
});

/**
 * IBKR books an FX leg as a buy of `EUR.USD`. It closes nothing and the rule
 * would sweep it up — but nobody opened it as a position, so calling it "still
 * open" is wrong, and the page explains those separately. Removing them here
 * would have deleted that explanation along with them.
 */
describe("currency conversions are not positions", () => {
  it("keeps an FX leg rather than calling it an open position", () => {
    const { rows, openInstruments } = onlyClosedPositions([
      row({ symbol: "EUR.USD", type: "BUY" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(openInstruments).toEqual([]);
  });

  it("still drops a real instrument alongside one", () => {
    const { rows, openInstruments } = onlyClosedPositions([
      row({ symbol: "EUR.USD", type: "BUY" }),
      row({ symbol: "IGLA", type: "BUY" }),
    ]);
    expect(rows.map((r) => r.symbol)).toEqual(["EUR.USD"]);
    expect(openInstruments).toEqual(["IGLA"]);
  });

  /** `BRK.B` has a dot and is not a currency pair. */
  it("does not mistake a ticker with a dot for one", () => {
    const { openInstruments } = onlyClosedPositions([row({ symbol: "BRK.B", type: "BUY" })]);
    expect(openInstruments).toEqual(["BRK.B"]);
  });
});
