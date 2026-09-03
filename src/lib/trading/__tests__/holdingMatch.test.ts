import { describe, it, expect } from "vitest";
import {
  normaliseInstrument,
  pairRealisedWithHeld,
  unmatchedOpen,
  type HeldPosition,
} from "../holdingMatch";
import type { TradeRow } from "../stats";

const trade = (over: Partial<TradeRow> = {}): TradeRow => ({
  date: "2026-03-02T10:00:00.000Z",
  type: "BUY",
  symbol: "HYPE",
  quantity: 1,
  amount: -100,
  fees: null,
  realizedPnl: null,
  description: null,
  ...over,
});

/**
 * The spellings the live account actually has. Of thirty traded symbols, five
 * matched the portfolio exactly, and the failures were two families rather
 * than noise.
 */
describe("reducing a portfolio spelling to the statement's", () => {
  it("strips Trading 212's venue letter and _EQ", () => {
    expect(normaliseInstrument("IGLAl_EQ")).toBe("IGLA");
    expect(normaliseInstrument("EGLNl_EQ")).toBe("EGLN");
    expect(normaliseInstrument("IPRPa_EQ")).toBe("IPRP");
    expect(normaliseInstrument("MVOLl_EQ")).toBe("MVOL");
    expect(normaliseInstrument("PHAGa_EQ")).toBe("PHAG");
    expect(normaliseInstrument("EUN3d_EQ")).toBe("EUN3");
  });

  it("leaves a plain ticker alone", () => {
    expect(normaliseInstrument("HYPE")).toBe("HYPE");
    expect(normaliseInstrument("XPL")).toBe("XPL");
    expect(normaliseInstrument("AVBC")).toBe("AVBC");
  });

  /**
   * Deliberately narrow. A rule that stripped any trailing letter would maul
   * every ticker that legitimately ends in one, which is most of them.
   */
  it("does not strip a letter that is not part of the suffix", () => {
    expect(normaliseInstrument("TESLA")).toBe("TESLA");
    expect(normaliseInstrument("BTC")).toBe("BTC");
    // Upper case before _EQ is not the venue letter.
    expect(normaliseInstrument("FOOD_EQ")).toBe("FOOD_EQ");
  });

  it("matches regardless of the case the source used", () => {
    expect(normaliseInstrument("hype")).toBe("HYPE");
  });
});

describe("realised beside unrealised", () => {
  const held: HeldPosition[] = [
    { symbol: "HYPE", unrealised: 12.5, value: 61.44 },
    { symbol: "IGLAl_EQ", unrealised: -2.1, value: 36.21 },
  ];

  const trades: TradeRow[] = [
    trade({ symbol: "HYPE", type: "BUY", quantity: 2 }),
    trade({ symbol: "HYPE", type: "SELL", quantity: 1, realizedPnl: 8 }),
    trade({ symbol: "IGLA", type: "BUY", quantity: 4 }),
    // Bought and fully sold: closed, so no unrealised is the right answer.
    trade({ symbol: "FEMY", type: "BUY", quantity: 3 }),
    trade({ symbol: "FEMY", type: "SELL", quantity: 3, realizedPnl: -1.2 }),
    // Still open by the trades, and nothing in the portfolio matches it.
    trade({ symbol: "GRASS", type: "BUY", quantity: 10 }),
  ];

  const realised = new Map([
    ["HYPE", 8],
    ["FEMY", -1.2],
  ]);

  const rows = pairRealisedWithHeld(trades, held, realised);
  const of = (symbol: string) => rows.find((r) => r.symbol === symbol)!;

  it("matches a plain ticker straight through", () => {
    expect(of("HYPE")).toMatchObject({ realised: 8, unrealised: 12.5, value: 61.44, missing: null });
  });

  /** The join the whole module exists for. */
  it("matches a statement ticker to the API's spelling of it", () => {
    expect(of("IGLA")).toMatchObject({ unrealised: -2.1, value: 36.21, missing: null });
  });

  /**
   * A closed position having no unrealised result is correct, not a failure,
   * and must not be reported as one — it is most of the trade history.
   */
  it("calls a fully sold position closed rather than unmatched", () => {
    expect(of("FEMY")).toMatchObject({ unrealised: null, netQuantity: 0, missing: "closed" });
  });

  /**
   * The case that would otherwise print a blank reading as "nothing gained".
   * The trades say ten units are open and the portfolio has no such position.
   */
  it("calls a still-open position with no match unmatched", () => {
    expect(of("GRASS")).toMatchObject({ unrealised: null, netQuantity: 10, missing: "unmatched" });
    expect(unmatchedOpen(rows)).toEqual(["GRASS"]);
  });

  it("nets buys against sells to decide what is still open", () => {
    expect(of("HYPE").netQuantity).toBe(1);
    expect(of("IGLA").netQuantity).toBe(4);
  });

  /**
   * Realised comes from the trade statistics, not from a second sum here.
   * There is one definition of a realised result and this is not going to be
   * a rival to it.
   */
  it("takes realised from what it was given, and zero where nothing closed", () => {
    expect(of("IGLA").realised).toBe(0);
    expect(of("GRASS").realised).toBe(0);
  });

  /**
   * IBKR books an FX leg as a buy or sell of EUR.USD, and it was the loudest
   * entry in the unmatched list — a currency pair reported as an instrument
   * nobody could find a holding for. `isInstrumentTrade` already knew.
   */
  it("never reports a currency conversion as an unmatched instrument", () => {
    const withFx = pairRealisedWithHeld(
      [
        trade({ symbol: "EUR.USD", type: "SELL", quantity: 7.78 }),
        trade({ symbol: "HYPE", type: "BUY", quantity: 2 }),
      ],
      held,
      new Map()
    );
    expect(withFx.map((r) => r.symbol)).toEqual(["HYPE"]);
    expect(unmatchedOpen(withFx)).toEqual([]);
  });

  it("ignores anything that is not a trade", () => {
    const withNoise = pairRealisedWithHeld(
      [...trades, trade({ symbol: "HYPE", type: "DIVIDEND", quantity: null })],
      held,
      realised
    );
    expect(withNoise.find((r) => r.symbol === "HYPE")!.netQuantity).toBe(1);
  });

  it("leads with the instruments that moved the most money", () => {
    expect(rows[0].symbol).toBe("HYPE");
  });

  it("has nothing to pair when nothing was traded", () => {
    expect(pairRealisedWithHeld([], held, new Map())).toEqual([]);
    expect(unmatchedOpen([])).toEqual([]);
  });

  /**
   * A sale is negative however the file signed the quantity. Statements are
   * inconsistent about it, and reading the sign rather than the type would
   * make a sale add to what is open.
   */
  it("treats a sale as a reduction whichever sign the file used", () => {
    const signed = pairRealisedWithHeld(
      [
        trade({ symbol: "ZZZ", type: "BUY", quantity: 5 }),
        trade({ symbol: "ZZZ", type: "SELL", quantity: -5 }),
      ],
      [],
      new Map()
    );
    expect(signed[0].netQuantity).toBe(0);
    expect(signed[0].missing).toBe("closed");
  });
});
