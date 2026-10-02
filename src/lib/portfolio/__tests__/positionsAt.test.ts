import { describe, it, expect } from "vitest";
import { buildPortfolioSeries, positionsAt } from "../series";

const p = (date: string, value: number) => ({ date, value });

const manual = [
  { key: "h:etf", points: [p("2026-08-01", 1000), p("2026-08-10", 1100)] },
  { key: "h:later", points: [p("2026-08-20", 300)] },
];
const synced = [
  { key: "c1:SOLD", connectionId: "c1", points: [p("2026-08-01", 500)] },
  { key: "c1:HELD", connectionId: "c1", points: [p("2026-08-01", 100), p("2026-08-05", 120), p("2026-08-25", 90)] },
];

describe("what was held on a day", () => {
  it("names each position held then, with what it was worth", () => {
    expect(positionsAt({ date: "2026-08-03", manual, synced })).toEqual([
      { key: "h:etf", value: 1000 },
      { key: "c1:SOLD", value: 500 },
      { key: "c1:HELD", value: 100 },
    ]);
  });

  it("leaves out a position closed by a later sync, and one not bought yet", () => {
    expect(positionsAt({ date: "2026-08-12", manual, synced }).map((x) => x.key)).toEqual(["h:etf", "c1:HELD"]);
  });

  /** The report's composition for a closed period must add up to the value line on its last day. */
  it("adds up to the portfolio's value on that day, every day", () => {
    const dates = ["2026-07-31", "2026-08-01", "2026-08-03", "2026-08-05", "2026-08-10", "2026-08-20", "2026-08-25", "2026-09-30"];
    const series = buildPortfolioSeries({ dates, manual: manual.map((m) => m.points), synced });
    for (const point of series) {
      const total = positionsAt({ date: point.date, manual, synced }).reduce((s, x) => s + x.value, 0);
      expect(Math.round(total * 100) / 100).toBe(point.portfolioValue);
    }
  });
});
