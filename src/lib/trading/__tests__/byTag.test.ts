import { describe, it, expect } from "vitest";
import { byTag, taggedTotals, type TradeRow } from "../stats";

const trade = (over: Partial<TradeRow> & { realizedPnl: number | null }): TradeRow => ({
  date: "2026-06-01T00:00:00.000Z",
  type: "SELL",
  symbol: "BTC",
  quantity: 1,
  amount: 100,
  fees: null,
  description: null,
  ...over,
});

/** A tag map keyed by the row's description, which is unique per fixture here. */
const taggedBy = (map: Record<string, string[]>) => (row: TradeRow) =>
  map[row.description ?? ""] ?? [];

describe("result by the labels you put on your own trades", () => {
  const rows = [
    trade({ description: "a", realizedPnl: 30 }),
    trade({ description: "b", realizedPnl: -10 }),
    trade({ description: "c", realizedPnl: 5, fees: 1 }),
  ];
  const tags = taggedBy({ a: ["breakout"], b: ["breakout"], c: ["scalp"] });

  it("totals each label and reports how often it won", () => {
    const [breakout, scalp] = byTag(rows, tags);
    expect(breakout).toMatchObject({
      tag: "breakout",
      closedTrades: 2,
      wins: 1,
      realized: 20,
      winRate: 50,
    });
    expect(scalp).toMatchObject({ tag: "scalp", closedTrades: 1, wins: 1, winRate: 100 });
  });

  it("keeps fees out of the result and names the difference", () => {
    const scalp = byTag(rows, tags).find((t) => t.tag === "scalp")!;
    expect(scalp.realized).toBe(5);
    expect(scalp.net).toBe(4);
  });

  it("reports the best and worst single trade under each label", () => {
    const breakout = byTag(rows, tags).find((t) => t.tag === "breakout")!;
    expect(breakout.best).toBe(30);
    expect(breakout.worst).toBe(-10);
  });

  it("ranks by what was actually kept, not by what was made", () => {
    expect(byTag(rows, tags).map((t) => t.tag)).toEqual(["breakout", "scalp"]);
  });
});

/**
 * These groups overlap, which is the one thing about this table that has to be
 * said out loud. Every other grouping in stats.ts partitions the history.
 */
describe("a trade wearing several labels", () => {
  const rows = [trade({ description: "a", realizedPnl: 40 })];
  const tags = taggedBy({ a: ["breakout", "news", "risky"] });

  it("counts in every one of them", () => {
    const out = byTag(rows, tags);
    expect(out).toHaveLength(3);
    for (const t of out) expect(t.realized).toBe(40);
  });

  /**
   * So the columns must never be presented as a breakdown of the total: three
   * labels on one winner would report 120 against a history that made 40.
   */
  it("makes the columns unaddable, which is why taggedTotals exists", () => {
    const summed = byTag(rows, tags).reduce((s, t) => s + t.realized, 0);
    expect(summed).toBe(120);
    expect(taggedTotals(rows, tags).realized).toBe(40);
  });

  it("does not double count a label repeated on one trade", () => {
    const twice = taggedBy({ a: ["breakout", "breakout"] });
    const [only] = byTag(rows, twice);
    expect(only.closedTrades).toBe(1);
    expect(only.realized).toBe(40);
  });
});

describe("what is left out", () => {
  /**
   * A tag is absent until you write one. Every other grouping here is
   * exhaustive because the venue always supplies a value; inventing an "unset"
   * bucket would put most of the history in it and say nothing.
   */
  it("gives an untagged trade no group of its own", () => {
    const rows = [trade({ description: "a", realizedPnl: 10 })];
    expect(byTag(rows, () => [])).toEqual([]);
  });

  /** Only a closed trade has a result to attribute to a label. */
  it("ignores a trade that closed nothing", () => {
    const rows = [trade({ description: "a", realizedPnl: null })];
    expect(byTag(rows, taggedBy({ a: ["breakout"] }))).toEqual([]);
  });

  /**
   * IBKR books a currency conversion as a buy or a sell of `EUR.USD`, and on a
   * live account those outnumbered every real position.
   */
  it("ignores a currency conversion even when it carries a tag", () => {
    const rows = [trade({ description: "a", symbol: "EUR.USD", realizedPnl: 12 })];
    expect(byTag(rows, taggedBy({ a: ["breakout"] }))).toEqual([]);
  });

  it("ignores a dividend", () => {
    const rows = [trade({ description: "a", type: "DIVIDEND", realizedPnl: 12 })];
    expect(byTag(rows, taggedBy({ a: ["income"] }))).toEqual([]);
  });
});

describe("how much of the history the table covers", () => {
  const rows = [
    trade({ description: "a", realizedPnl: 30 }),
    trade({ description: "b", realizedPnl: -10 }),
    trade({ description: "c", realizedPnl: 5 }),
    trade({ description: "d", realizedPnl: null }),
  ];
  const tags = taggedBy({ a: ["breakout", "news"], b: ["scalp"] });

  it("counts each trade once, however many labels it wears", () => {
    expect(taggedTotals(rows, tags)).toEqual({ tagged: 2, untagged: 1, realized: 20 });
  });

  it("does not count an open trade as untagged work still to do", () => {
    // "d" closed nothing, so it is not a trade anyone can label a result on.
    const totals = taggedTotals(rows, tags);
    expect(totals.tagged + totals.untagged).toBe(3);
  });
});
