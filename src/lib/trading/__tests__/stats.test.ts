import { describe, expect, it } from "vitest";
import {
  cumulativePnl,
  bySymbol,
  byDirection,
  directionOf,
  byMonth,
  byHour,
  averageSize,
  holdingPeriods,
  holdingSummary,
  isTrade,
  type TradeRow,
} from "../stats";

function row(over: Partial<TradeRow> = {}): TradeRow {
  return {
    date: "2026-08-21T20:51:00.000Z",
    type: "SELL",
    symbol: "FIL",
    quantity: 12,
    amount: 26.34,
    fees: 0.01,
    realizedPnl: 1.97,
    description: "Close Long",
    ...over,
  };
}

describe("what counts as a trade", () => {
  it("takes buys and sells and leaves the rest alone", () => {
    // A dividend is money arriving, not a decision you made about a position.
    expect(isTrade(row({ type: "BUY" }))).toBe(true);
    expect(isTrade(row({ type: "SELL" }))).toBe(true);
    expect(isTrade(row({ type: "DIVIDEND" }))).toBe(false);
    expect(isTrade(row({ type: "INTEREST" }))).toBe(false);
    expect(isTrade(row({ type: "DEPOSIT" }))).toBe(false);
  });
});

describe("am I winning or losing", () => {
  it("keeps fees as their own line rather than hiding them in the result", () => {
    // The real account: -5.93 realised against 6.18 of fees. Only `net` shows
    // that a near-breakeven quarter was a losing one.
    const rows = [
      row({ date: "2026-06-01T10:00:00.000Z", realizedPnl: -5.93, fees: 6.18 }),
    ];
    const [point] = cumulativePnl(rows);

    expect(point.realized).toBe(-5.93);
    expect(point.fees).toBe(6.18);
    expect(point.net).toBe(-12.11);
  });

  it("accumulates across days", () => {
    const points = cumulativePnl([
      row({ date: "2026-06-01T10:00:00.000Z", realizedPnl: 10, fees: 1 }),
      row({ date: "2026-06-03T10:00:00.000Z", realizedPnl: -4, fees: 1 }),
    ]);

    expect(points.map((p) => p.realized)).toEqual([10, 6]);
    expect(points.map((p) => p.net)).toEqual([9, 4]);
  });

  it("invents no day on which nothing happened", () => {
    // A flat stretch is a stretch you did not trade; padding it would suggest
    // activity that never occurred.
    const points = cumulativePnl([
      row({ date: "2026-06-01T10:00:00.000Z" }),
      row({ date: "2026-06-09T10:00:00.000Z" }),
    ]);

    expect(points).toHaveLength(2);
  });

  it("counts fees from opening fills too", () => {
    // You pay to get in as well as to get out.
    const [point] = cumulativePnl([
      row({ date: "2026-06-01T10:00:00.000Z", realizedPnl: null, fees: 0.5 }),
    ]);

    expect(point.realized).toBe(0);
    expect(point.fees).toBe(0.5);
  });
});

describe("what do I trade well", () => {
  const rows = [
    row({ symbol: "FIL", realizedPnl: 3, fees: 0.1 }),
    row({ symbol: "FIL", realizedPnl: -1, fees: 0.1 }),
    row({ symbol: "LIT", realizedPnl: -0.65, fees: 0.5 }),
  ];

  it("counts only fills that closed something", () => {
    // Counting opens would double every round trip and halve every win rate.
    const stats = bySymbol([...rows, row({ symbol: "FIL", realizedPnl: null, fees: 0.2 })]);
    const fil = stats.find((s) => s.symbol === "FIL")!;

    expect(fil.closedTrades).toBe(2);
    expect(fil.wins).toBe(1);
    expect(fil.winRate).toBe(50);
    // The opening fill's fee still counts: it was still paid.
    expect(fil.fees).toBeCloseTo(0.4, 2);
  });

  it("ranks on what was left after costs, not before", () => {
    // An instrument can win on paper and lose after fees, and it is the second
    // one that decides whether to keep trading it.
    const stats = bySymbol([row({ symbol: "X", realizedPnl: 1, fees: 3 })]);
    expect(stats[0].realized).toBe(1);
    expect(stats[0].net).toBe(-2);
  });

  it("puts the best net first", () => {
    expect(bySymbol(rows)[0].symbol).toBe("FIL");
  });
});

describe("which way I was betting", () => {
  it("reads the venue's own wording", () => {
    expect(directionOf(row({ description: "Close Long" }))).toBe("long");
    expect(directionOf(row({ description: "Open Short" }))).toBe("short");
  });

  it("says unknown rather than assuming long", () => {
    // Most positions are long, which is what makes guessing look right while
    // quietly hiding every short.
    expect(directionOf(row({ description: "Sale" }))).toBe("unknown");
    expect(directionOf(row({ description: null }))).toBe("unknown");
  });

  it("splits the result by direction", () => {
    const stats = byDirection([
      row({ description: "Close Long", realizedPnl: 5, fees: 0 }),
      row({ description: "Close Short", realizedPnl: -2, fees: 0 }),
    ]);

    expect(stats.find((s) => s.direction === "long")!.net).toBe(5);
    expect(stats.find((s) => s.direction === "short")!.net).toBe(-2);
  });
});

describe("how often and when", () => {
  it("counts trades and volume by month", () => {
    const months = byMonth([
      row({ date: "2026-06-01T10:00:00.000Z", amount: -40 }),
      row({ date: "2026-06-20T10:00:00.000Z", amount: 60 }),
      row({ date: "2026-07-02T10:00:00.000Z", amount: -10 }),
    ]);

    expect(months.map((m) => m.month)).toEqual(["2026-06", "2026-07"]);
    // Volume is cash through the book, so a buy counts as much as a sale.
    expect(months[0].volume).toBe(100);
  });

  it("buckets by hour and covers the whole day", () => {
    const hours = byHour([row({ date: "2026-08-21T20:51:00.000Z" })]);

    expect(hours).toHaveLength(24);
    expect(hours[20].trades).toBe(1);
    expect(hours[3].trades).toBe(0);
  });

  it("measures the typical trade by its size, ignoring direction", () => {
    expect(averageSize([row({ amount: -40 }), row({ amount: 60 })])).toBe(50);
  });

  it("has no average with nothing to average", () => {
    expect(averageSize([])).toBeNull();
    expect(averageSize([row({ type: "DIVIDEND" })])).toBeNull();
  });
});

describe("how long I hold", () => {
  it("matches a close to the open it answers", () => {
    const periods = holdingPeriods([
      row({ date: "2026-08-20T10:00:00.000Z", type: "BUY", quantity: 10, realizedPnl: null }),
      row({ date: "2026-08-21T10:00:00.000Z", type: "SELL", quantity: 10, realizedPnl: 5 }),
    ]);

    expect(periods).toHaveLength(1);
    expect(periods[0].hours).toBe(24);
    expect(periods[0].realizedPnl).toBe(5);
  });

  it("consumes the oldest lot first when a position was built in pieces", () => {
    const periods = holdingPeriods([
      row({ date: "2026-08-01T00:00:00.000Z", type: "BUY", quantity: 5, realizedPnl: null }),
      row({ date: "2026-08-10T00:00:00.000Z", type: "BUY", quantity: 5, realizedPnl: null }),
      row({ date: "2026-08-11T00:00:00.000Z", type: "SELL", quantity: 5, realizedPnl: 2 }),
    ]);

    // Dated from 1 August, not 10 August: first in, first out.
    expect(periods[0].openedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(periods[0].hours).toBe(240);
  });

  it("skips a close with no open behind it", () => {
    // The venue's window only goes back so far. Dating from an arbitrary point
    // would give a plausible number with nothing behind it.
    expect(
      holdingPeriods([row({ date: "2026-08-21T10:00:00.000Z", type: "SELL", realizedPnl: 5 })])
    ).toEqual([]);
  });

  it("compares how long winners are held against losers", () => {
    // The pattern this exists to expose: cutting winners early and letting
    // losers run is invisible in a P&L total.
    const summary = holdingSummary([
      { symbol: "A", openedAt: "", closedAt: "", hours: 2, realizedPnl: 5 },
      { symbol: "B", openedAt: "", closedAt: "", hours: 4, realizedPnl: 3 },
      { symbol: "C", openedAt: "", closedAt: "", hours: 100, realizedPnl: -8 },
    ]);

    expect(summary.winnersMedianHours).toBe(3);
    expect(summary.losersMedianHours).toBe(100);
    expect(summary.count).toBe(3);
  });

  it("uses the median, which one long trade cannot drag", () => {
    const summary = holdingSummary([
      { symbol: "A", openedAt: "", closedAt: "", hours: 1, realizedPnl: 1 },
      { symbol: "B", openedAt: "", closedAt: "", hours: 2, realizedPnl: 1 },
      { symbol: "C", openedAt: "", closedAt: "", hours: 5000, realizedPnl: 1 },
    ]);

    expect(summary.medianHours).toBe(2);
  });

  it("has nothing to say about an empty history", () => {
    const summary = holdingSummary([]);
    expect(summary.medianHours).toBeNull();
    expect(summary.count).toBe(0);
  });
});
