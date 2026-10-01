import { describe, expect, it } from "vitest";
import { chargesUntil, daysLeftInMonth, endOfMonth, monthAhead } from "../monthAhead";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

describe("the rest of the month", () => {
  it("ends on the month's last day, whatever its length", () => {
    expect(ymd(endOfMonth(day(2026, 9, 30)))).toBe("2026-9-30");
    expect(ymd(endOfMonth(day(2026, 2, 3)))).toBe("2026-2-28");
    expect(daysLeftInMonth(day(2026, 9, 30))).toBe(0);
    expect(daysLeftInMonth(day(2026, 9, 1))).toBe(29);
  });
});

describe("a subscription's charges until the month ends", () => {
  const today = day(2026, 9, 10);
  const end = endOfMonth(today);

  it("counts a monthly one once, if it still falls this month", () => {
    const later = { cadence: "monthly" as const, nextChargeAt: day(2026, 1, 25), active: true };
    const earlier = { cadence: "monthly" as const, nextChargeAt: day(2026, 1, 5), active: true };
    expect(chargesUntil(later, today, end).map(ymd)).toEqual(["2026-9-25"]);
    expect(chargesUntil(earlier, today, end)).toEqual([]);
  });

  it("counts a weekly one every time it falls", () => {
    const weekly = { cadence: "weekly" as const, nextChargeAt: day(2026, 9, 3), active: true };
    expect(chargesUntil(weekly, today, end).map(ymd)).toEqual(["2026-9-10", "2026-9-17", "2026-9-24"]);
  });

  it("keeps a charge on the 31st at the end of a short month", () => {
    const eom = { cadence: "monthly" as const, nextChargeAt: day(2026, 1, 31), active: true };
    expect(chargesUntil(eom, today, end).map(ymd)).toEqual(["2026-9-30"]);
  });

  it("counts nothing for a paused one or one with no date", () => {
    expect(chargesUntil({ cadence: "monthly", nextChargeAt: day(2026, 1, 25), active: false }, today, end)).toEqual([]);
    expect(chargesUntil({ cadence: "monthly", nextChargeAt: null, active: true }, today, end)).toEqual([]);
  });
});

describe("in minus out", () => {
  it("takes subscriptions and what budgets have left from what comes in", () => {
    const ahead = monthAhead({
      end: day(2026, 9, 30),
      subscriptions: { total: 45.5, count: 3 },
      budgets: { total: 300, count: 2 },
      comingIn: { total: 1200, count: 1 },
      unconverted: 0,
    });
    expect(ahead.net).toBe(854.5);
  });
});
