import { describe, expect, it } from "vitest";
import { fillToActivity, fillsToActivity, fillType, fillAmount } from "../fills";

/**
 * Every fixture here is a real fill from the live account, which is where the
 * shapes come from: `dir` reads "Close Long", `closedPnl` is set only on the
 * fills that closed something, and `tid` is the venue's own id.
 */
const closeLong = {
  coin: "FIL",
  px: "2.1948",
  sz: "12.0",
  side: "A",
  time: 1755809460000,
  dir: "Close Long",
  closedPnl: "1.973376",
  fee: "0.007759",
  tid: 481516234,
};

const openLong = {
  coin: "FIL",
  px: "1.98",
  sz: "18.0",
  side: "B",
  time: 1755700000000,
  dir: "Open Long",
  closedPnl: "0.0",
  fee: "0.0142",
  tid: 481516111,
};

describe("reading which way a fill went", () => {
  it("calls opening a long a buy and closing it a sell", () => {
    expect(fillType(openLong)).toBe("BUY");
    expect(fillType(closeLong)).toBe("SELL");
  });

  it("treats opening a short as a sale of exposure", () => {
    // It is a sell on the book and a sale of exposure; both readings agree.
    expect(fillType({ dir: "Open Short", side: "A" })).toBe("SELL");
  });

  it("falls back to the book side when the venue gives no direction", () => {
    expect(fillType({ side: "A" })).toBe("SELL");
    expect(fillType({ side: "B" })).toBe("BUY");
  });
});

describe("what a fill did to the cash", () => {
  it("makes a buy negative and a sale positive", () => {
    expect(fillAmount(openLong)).toBeCloseTo(-35.64, 2);
    expect(fillAmount(closeLong)).toBeCloseTo(26.34, 2);
  });

  it("leaves fees out of the amount", () => {
    // `amount` is the trade and `fees` is the cost of doing it. Folding them
    // together has the ledger subtract fees twice.
    const a = fillToActivity(closeLong)!;
    expect(a.amount).toBeCloseTo(26.34, 2);
    expect(a.fees).toBeCloseTo(0.007759, 6);
  });
});

describe("turning a fill into an activity row", () => {
  it("keeps the detail a history needs", () => {
    const a = fillToActivity(closeLong)!;

    expect(a.type).toBe("SELL");
    expect(a.symbol).toBe("FIL");
    expect(a.quantity).toBe(12);
    expect(a.price).toBeCloseTo(2.1948, 4);
    // Four places, matching the column it is stored in. Carrying more here
    // than the database keeps would only be lost on the way in.
    expect(a.realizedPnl).toBeCloseTo(1.9734, 4);
    // The venue's id, which is what makes a re-sync a no-op.
    expect(a.externalId).toBe("481516234");
  });

  it("records no realised P&L on a fill that opened a position", () => {
    // Hyperliquid writes "0.0" there. Storing it would put a break-even trade
    // in the history that never happened.
    expect(fillToActivity(openLong)!.realizedPnl).toBeNull();
  });

  it("skips a fill it cannot read rather than storing a zero", () => {
    // A trade recorded at a price of nothing looks like a real event and would
    // feed every chart built on top of it.
    expect(fillToActivity({ coin: "FIL", sz: "1", time: 1 })).toBeNull();
    expect(fillToActivity({ coin: "FIL", px: "2", time: 1 })).toBeNull();
    expect(fillToActivity({ px: "2", sz: "1", time: 1 })).toBeNull();
    expect(fillToActivity({ coin: "FIL", px: "2", sz: "1" })).toBeNull();
  });

  it("dates the row from the venue's timestamp", () => {
    expect(fillToActivity(closeLong)!.date.slice(0, 10)).toBe(
      new Date(1755809460000).toISOString().slice(0, 10)
    );
  });
});

describe("a whole batch of fills", () => {
  it("returns them newest first", () => {
    const rows = fillsToActivity([openLong, closeLong]);
    expect(rows).toHaveLength(2);
    expect(rows[0].externalId).toBe("481516234");
  });

  it("drops what it cannot read without losing the rest", () => {
    const rows = fillsToActivity([closeLong, { coin: "X" }, openLong]);
    expect(rows).toHaveLength(2);
  });

  it("survives a response that is not a list", () => {
    expect(fillsToActivity(null)).toEqual([]);
    expect(fillsToActivity("nope")).toEqual([]);
  });
});
