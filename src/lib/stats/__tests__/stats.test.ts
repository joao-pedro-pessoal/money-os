import { describe, it, expect } from "vitest";
import {
  periodReturns, drawdown, monthlyFlows, averageSavingsRate,
  concentration, runway, project, monthsToGoal,
} from "../index";

describe("periodReturns", () => {
  const now = new Date("2026-08-08T12:00:00Z");
  const series = [
    { date: "2026-06-01", value: 1000 },
    { date: "2026-07-09", value: 1100 }, // 30 days before now
    { date: "2026-08-01", value: 1150 },
    { date: "2026-08-08", value: 1200 },
  ];

  it("measures the month against the value 30 days ago", () => {
    const m = periodReturns(series, now).find((p) => p.key === "1m")!;
    expect(m.from).toBe(1100);
    expect(m.change).toBe(100);
    expect(m.percent).toBeCloseTo(9.09, 1);
  });

  it("measures all time from the earliest point", () => {
    const all = periodReturns(series, now).find((p) => p.key === "all")!;
    expect(all.from).toBe(1000);
    expect(all.change).toBe(200);
    expect(all.percent).toBe(20);
  });

  it("reports null rather than inventing a start when history is too short", () => {
    const y = periodReturns(series, now).find((p) => p.key === "1y")!;
    expect(y.from).toBeNull();
    expect(y.percent).toBeNull();
  });

  it("handles an empty history", () => {
    const r = periodReturns([], now);
    expect(r.every((p) => p.from === null)).toBe(true);
  });

  it("avoids dividing by zero when the starting value was zero", () => {
    const r = periodReturns([{ date: "2026-01-01", value: 0 }, { date: "2026-08-08", value: 500 }], now);
    expect(r.find((p) => p.key === "all")!.percent).toBeNull();
  });
});

describe("drawdown", () => {
  it("finds the worst peak-to-trough fall", () => {
    const d = drawdown([
      { date: "2026-01-01", value: 100 },
      { date: "2026-02-01", value: 150 }, // peak
      { date: "2026-03-01", value: 90 }, // trough
      { date: "2026-04-01", value: 120 },
    ]);
    expect(d.maxDrawdown).toBe(60);
    expect(d.maxDrawdownPercent).toBe(40);
    expect(d.peakDate).toBe("2026-02-01");
    expect(d.troughDate).toBe("2026-03-01");
  });

  it("reports how far below the all-time high we are now", () => {
    const d = drawdown([
      { date: "2026-01-01", value: 200 },
      { date: "2026-02-01", value: 150 },
    ]);
    expect(d.currentDrawdown).toBe(50);
    expect(d.currentDrawdownPercent).toBe(25);
  });

  it("is zero for a line that only goes up", () => {
    const d = drawdown([
      { date: "2026-01-01", value: 100 },
      { date: "2026-02-01", value: 200 },
    ]);
    expect(d.maxDrawdown).toBe(0);
    expect(d.currentDrawdown).toBe(0);
    expect(d.peakDate).toBeNull();
  });

  it("handles an empty series", () => {
    expect(drawdown([]).maxDrawdown).toBe(0);
  });
});

describe("monthlyFlows", () => {
  const tx = [
    { date: "2026-01-05", amount: 2000, type: "income" },
    { date: "2026-01-20", amount: -500, type: "expense" },
    { date: "2026-01-25", amount: -300, type: "expense" },
    { date: "2026-02-05", amount: 2000, type: "income" },
    { date: "2026-02-10", amount: -2500, type: "expense" },
    { date: "2026-02-15", amount: -1000, type: "transfer" }, // must be ignored
  ];

  it("groups by month and computes the savings rate", () => {
    const f = monthlyFlows(tx);
    expect(f[0].month).toBe("2026-01");
    expect(f[0].income).toBe(2000);
    expect(f[0].expenses).toBe(800);
    expect(f[0].net).toBe(1200);
    expect(f[0].savingsRate).toBe(60);
  });

  it("reports a negative savings rate when you overspend", () => {
    expect(monthlyFlows(tx)[1].savingsRate).toBe(-25);
  });

  it("never counts transfers as income or expense", () => {
    expect(monthlyFlows(tx)[1].expenses).toBe(2500); // not 3500
  });

  it("returns null, not zero, for a month with no income", () => {
    const f = monthlyFlows([{ date: "2026-03-01", amount: -100, type: "expense" }]);
    expect(f[0].savingsRate).toBeNull();
  });

  it("averages only the months that had income", () => {
    const f = monthlyFlows([
      { date: "2026-01-05", amount: 100, type: "income" },
      { date: "2026-02-05", amount: -50, type: "expense" },
    ]);
    expect(averageSavingsRate(f)).toBe(100);
  });

  it("returns null when nothing can be averaged", () => {
    expect(averageSavingsRate([])).toBeNull();
  });
});

describe("concentration", () => {
  it("spots a portfolio riding on one position", () => {
    const c = concentration([
      { name: "BTC", value: 900 },
      { name: "ETH", value: 50 },
      { name: "SOL", value: 50 },
    ]);
    expect(c.largestName).toBe("BTC");
    expect(c.largestShare).toBe(90);
    // Behaves like far fewer than 3 holdings.
    expect(c.effectiveCount).toBeLessThan(1.3);
  });

  it("sees an evenly spread portfolio as its real count", () => {
    const c = concentration([
      { name: "A", value: 250 },
      { name: "B", value: 250 },
      { name: "C", value: 250 },
      { name: "D", value: 250 },
    ]);
    expect(c.effectiveCount).toBe(4);
    expect(c.largestShare).toBe(25);
  });

  it("handles a single holding as fully concentrated", () => {
    const c = concentration([{ name: "Only", value: 100 }]);
    expect(c.index).toBe(100);
    expect(c.effectiveCount).toBe(1);
  });

  it("ignores zero and negative values", () => {
    const c = concentration([{ name: "A", value: 100 }, { name: "B", value: 0 }]);
    expect(c.largestShare).toBe(100);
  });

  it("handles nothing at all", () => {
    expect(concentration([]).effectiveCount).toBe(0);
  });
});

describe("runway", () => {
  it("says how many months the money lasts", () => {
    expect(runway(6000, 1500)).toBe(4);
  });

  it("returns null when there is no spending to divide by", () => {
    expect(runway(6000, 0)).toBeNull();
  });
});

describe("project", () => {
  it("compounds monthly contributions and growth", () => {
    // 0% return: 1000 + 12 x 100 = 2200 after a year.
    expect(project(1000, 100, 0, [1])[0].value).toBe(2200);
  });

  it("grows the starting amount at the given rate", () => {
    // 12% a year compounded monthly on 1000, no contributions.
    const v = project(1000, 0, 12, [1])[0].value;
    expect(v).toBeGreaterThan(1126);
    expect(v).toBeLessThan(1127);
  });

  it("handles saving nothing", () => {
    expect(project(1000, 0, 0, [5])[0].value).toBe(1000);
  });
});

describe("monthsToGoal", () => {
  it("counts the months needed", () => {
    expect(monthsToGoal(0, 1000, 250)).toBe(4);
  });

  it("rounds up a partial month", () => {
    expect(monthsToGoal(0, 1000, 300)).toBe(4);
  });

  it("is zero when the goal is already met", () => {
    expect(monthsToGoal(1000, 1000, 100)).toBe(0);
    expect(monthsToGoal(1500, 1000, 100)).toBe(0);
  });

  it("returns null when saving nothing — the goal never arrives", () => {
    expect(monthsToGoal(0, 1000, 0)).toBeNull();
    expect(monthsToGoal(0, 1000, -50)).toBeNull();
  });
});
