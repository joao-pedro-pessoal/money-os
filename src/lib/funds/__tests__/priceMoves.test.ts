import { describe, expect, it } from "vitest";
import { changeSince, closeAt, parsePriceSeries, priceChanges } from "../priceMoves";

const DAY = 86_400;
const NOW = Date.UTC(2026, 8, 20) / 1000;

/** A weekly series ending today, `weeks` long, at a price you choose per week. */
const series = (closes: number[]) => ({
  currency: "USD",
  points: closes.map((close, i) => ({ time: NOW - (closes.length - 1 - i) * 7 * DAY, close })),
});

describe("a company's price over time", () => {
  it("reads the source's weekly closes, oldest first", () => {
    const parsed = parsePriceSeries({
      chart: {
        result: [
          {
            meta: { currency: "EUR" },
            timestamp: [1000, 2000],
            indicators: { quote: [{ close: [10, 12] }] },
          },
        ],
      },
    });
    expect(parsed).toEqual({ currency: "EUR", points: [{ time: 1000, close: 10 }, { time: 2000, close: 12 }] });
  });

  /** A week carried forward is a flat week that never happened. */
  it("drops a week the source has no close for", () => {
    const parsed = parsePriceSeries({
      chart: { result: [{ timestamp: [1000, 2000, 3000], indicators: { quote: [{ close: [10, null, 12] }] } }] },
    });
    expect(parsed?.points).toEqual([{ time: 1000, close: 10 }, { time: 3000, close: 12 }]);
  });

  it("has nothing to say about a reply with no prices", () => {
    expect(parsePriceSeries({ chart: { result: [{ timestamp: [], indicators: { quote: [{ close: [] }] } }] } })).toBeNull();
    expect(parsePriceSeries({ chart: { error: "Not Found" } })).toBeNull();
    expect(parsePriceSeries(null)).toBeNull();
  });
});

describe("the move over each window", () => {
  /** Five and a half years of 100, then today at 150: +50% over every window. */
  const fiveYears = series([...Array(286).fill(100), 150]);

  it("measures every window from the same series", () => {
    const changes = priceChanges(fiveYears, NOW * 1000);
    expect(changes.m1).toBe(50);
    expect(changes.y1).toBe(50);
    expect(changes.y5).toBe(50);
  });

  it("works out a fall as readily as a rise", () => {
    const halved = series([...Array(60).fill(200), 100]);
    expect(priceChanges(halved, NOW * 1000).m6).toBe(-50);
  });

  /**
   * A company listed eighteen months ago has no five-year change. Measuring
   * from its first day would label its whole life as five years' growth.
   */
  it("leaves a window the series does not reach back to unanswered", () => {
    const young = series([...Array(70).fill(10), 20]);
    const changes = priceChanges(young, NOW * 1000);
    expect(changes.y1).toBe(100);
    expect(changes.y3).toBeUndefined();
    expect(changes.y5).toBeUndefined();
  });

  it("finds the last close at or before a moment, never the one after", () => {
    const s = series([10, 20, 30]);
    expect(closeAt(s, NOW)).toBe(30);
    expect(closeAt(s, NOW - 7 * DAY)).toBe(20);
    expect(closeAt(s, NOW - 30 * DAY)).toBeNull();
  });
});

describe("the move since a day you name", () => {
  const s = series([...Array(52).fill(50), 75]);

  it("measures from the close of that day", () => {
    const aYearAgo = new Date((NOW - 350 * DAY) * 1000).toISOString().slice(0, 10);
    expect(changeSince(s, aYearAgo)).toBe(50);
  });

  /** The shares a fund held before this listing existed are not these shares. */
  it("says nothing where the series starts after the day", () => {
    expect(changeSince(s, "2000-01-01")).toBeNull();
    expect(changeSince(s, "not a date")).toBeNull();
  });
});
