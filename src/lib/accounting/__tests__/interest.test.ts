import { describe, it, expect } from "vitest";
import {
  daysBetween,
  accrue,
  expectedSince,
  compare,
  effectiveAnnualRate,
  perDay,
} from "../interest";

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(new Date(2026, 7, 1), new Date(2026, 7, 31))).toBe(30);
  });

  it("ignores the clock", () => {
    expect(daysBetween(new Date(2026, 7, 1, 23, 59), new Date(2026, 7, 2, 0, 1))).toBe(1);
  });

  it("survives a daylight-saving boundary", () => {
    // Late October in Europe. A naive millisecond division gives 30.96 days.
    expect(daysBetween(new Date(2026, 9, 1), new Date(2026, 10, 1))).toBe(31);
  });

  it("is zero for the same day", () => {
    expect(daysBetween(new Date(2026, 7, 14), new Date(2026, 7, 14))).toBe(0);
  });

  it("goes negative when the dates are the wrong way round", () => {
    expect(daysBetween(new Date(2026, 7, 31), new Date(2026, 7, 1))).toBe(-30);
  });
});

describe("accrue", () => {
  it("computes simple interest for a period", () => {
    // 4 000 € at 2.5% for 31 days: 4000 × 0.025 × 31/365 = 8.49
    const a = accrue({ balance: 4000, aprPercent: 2.5, days: 31 });
    expect(a.gross).toBe(8.49);
    expect(a.net).toBe(8.49);
    expect(a.tax).toBe(0);
  });

  it("pays more on a 360-day convention", () => {
    const on365 = accrue({ balance: 4000, aprPercent: 2.5, days: 31, dayCount: 365 });
    const on360 = accrue({ balance: 4000, aprPercent: 2.5, days: 31, dayCount: 360 });
    expect(on360.gross).toBeGreaterThan(on365.gross);
    // About 1.4% more — roughly the gap between two competing accounts.
    expect(on360.gross / on365.gross).toBeCloseTo(365 / 360, 3);
  });

  it("subtracts tax withheld at source", () => {
    const a = accrue({ balance: 4000, aprPercent: 2.5, days: 365, withholdingPercent: 28 });
    expect(a.gross).toBe(100);
    expect(a.tax).toBe(28);
    expect(a.net).toBe(72);
  });

  it("earns a full year's rate over a full year", () => {
    const a = accrue({ balance: 1000, aprPercent: 3, days: 365 });
    expect(a.gross).toBe(30);
  });

  it("is zero for zero days", () => {
    expect(accrue({ balance: 4000, aprPercent: 2.5, days: 0 }).gross).toBe(0);
  });

  it("never pays for negative days", () => {
    // A period the wrong way round must not invent money.
    expect(accrue({ balance: 4000, aprPercent: 2.5, days: -30 }).gross).toBe(0);
  });

  it("is zero at a zero rate", () => {
    expect(accrue({ balance: 4000, aprPercent: 0, days: 365 }).gross).toBe(0);
  });

  it("handles an overdrawn balance as interest owed", () => {
    // A negative balance at a rate produces negative interest — that's a debt
    // charge, and pretending it's zero would flatter the account.
    expect(accrue({ balance: -1000, aprPercent: 5, days: 365 }).gross).toBe(-50);
  });

  it("ignores a fractional day rather than rounding it up", () => {
    expect(accrue({ balance: 4000, aprPercent: 2.5, days: 30.9 }).days).toBe(30);
  });
});

describe("expectedSince", () => {
  it("works out the period from the dates", () => {
    const a = expectedSince({
      balance: 4000,
      aprPercent: 2.5,
      since: new Date(2026, 6, 1),
      until: new Date(2026, 7, 1),
    });
    expect(a.days).toBe(31);
    expect(a.gross).toBe(8.49);
  });

  it("is zero when no time has passed", () => {
    const d = new Date(2026, 7, 14);
    expect(expectedSince({ balance: 4000, aprPercent: 2.5, since: d, until: d }).gross).toBe(0);
  });
});

describe("compare", () => {
  it("calls a small disagreement a match", () => {
    // Banks round per day and apply rate changes mid-period; a cent or two of
    // difference is normal, and flagging it would train you to ignore warnings.
    expect(compare(8.49, 8.5).level).toBe("match");
  });

  it("notes a moderate disagreement without alarm", () => {
    expect(compare(100, 95).level).toBe("close");
  });

  it("flags a figure that is badly off", () => {
    expect(compare(100, 50).level).toBe("off");
  });

  it("reports the direction of the difference", () => {
    expect(compare(100, 90).difference).toBe(-10);
    expect(compare(100, 110).difference).toBe(10);
  });

  it("has no percentage to report against zero expected", () => {
    expect(compare(0, 5).percentOff).toBeNull();
    expect(compare(0, 5).level).toBe("match");
  });
});

describe("effectiveAnnualRate", () => {
  it("is higher than the APR when interest is paid monthly", () => {
    // 3% paid monthly is not 3% a year: each payment joins the balance.
    expect(effectiveAnnualRate(3, 12)).toBeCloseTo(3.04, 2);
  });

  it("equals the APR when paid once a year", () => {
    expect(effectiveAnnualRate(3, 1)).toBe(3);
  });

  it("falls back to the APR rather than dividing by zero", () => {
    expect(effectiveAnnualRate(3, 0)).toBe(3);
  });

  it("grows with the frequency", () => {
    expect(effectiveAnnualRate(5, 365)).toBeGreaterThan(effectiveAnnualRate(5, 12));
  });
});

describe("perDay", () => {
  it("gives the daily earning at the current balance", () => {
    expect(perDay(10000, 3.65)).toBeCloseTo(1, 4);
  });

  it("is zero without a rate", () => {
    expect(perDay(10000, 0)).toBe(0);
  });
});
