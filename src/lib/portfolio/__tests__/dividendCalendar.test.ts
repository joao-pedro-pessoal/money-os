import { describe, expect, it } from "vitest";
import { calendarDay, incomeForecast, upcomingDividends, type Announced } from "../dividendCalendar";
import type { TickerSummary } from "../dividends";

const now = new Date("2026-09-18T12:00:00Z");

const summary = (ticker: string, estimate: Date | null, over: Partial<TickerSummary> = {}): TickerSummary => ({
  ticker,
  instrumentName: `${ticker} Inc`,
  payments: 4,
  total: 10,
  currency: "USD",
  firstPaidOn: new Date("2025-01-01"),
  lastPaidOn: new Date("2026-07-01"),
  lastAmount: 2.5,
  rhythm: { cadence: "quarterly", medianGapDays: 91, payments: 4, confidence: "good", estimatedNext: estimate, summary: "" },
  interestOnly: false,
  ...over,
});

describe("calendarDay", () => {
  it("reads Yahoo's epoch seconds as a UTC day", () => {
    expect(calendarDay({ raw: 1790812800, fmt: "2026-10-01" })).toBe("2026-10-01");
    expect(calendarDay(1790812800)).toBe("2026-10-01");
    expect(calendarDay({})).toBeNull();
  });
});

describe("upcomingDividends", () => {
  it("prefers an announced payment day to the estimate, and says which is which", () => {
    const announced = new Map<string, Announced>([["KO", { exDividendDate: "2026-09-15", dividendDate: "2026-10-01" }]]);
    const list = upcomingDividends(
      [summary("KO", new Date("2026-12-20T00:00:00Z")), summary("O", new Date("2026-10-10T00:00:00Z"))],
      announced,
      now
    );
    expect(list.map((d) => [d.ticker, d.kind, d.date.toISOString().slice(0, 10), d.payDateAnnounced])).toEqual([
      ["KO", "announced", "2026-10-01", true],
      ["O", "estimated", "2026-10-10", false],
    ]);
  });

  it("uses an announced ex-date while the payment day is not published", () => {
    const announced = new Map<string, Announced>([["O", { exDividendDate: "2026-09-30", dividendDate: null }]]);
    const [d] = upcomingDividends([summary("O", null)], announced, now);
    expect(d).toMatchObject({ kind: "announced", exDividendDate: "2026-09-30", payDateAnnounced: false });
  });

  it("falls back to the estimate once an announcement has passed", () => {
    const announced = new Map<string, Announced>([["AAPL", { exDividendDate: "2026-08-10", dividendDate: "2026-08-13" }]]);
    const [d] = upcomingDividends([summary("AAPL", new Date("2026-11-13T00:00:00Z"))], announced, now);
    expect(d.kind).toBe("estimated");
  });

  it("leaves out interest, patternless payers and past estimates", () => {
    expect(
      upcomingDividends(
        [
          summary("CASH", new Date("2026-10-01"), { interestOnly: true }),
          summary("ONE", new Date("2026-10-01"), {
            rhythm: { cadence: null, medianGapDays: null, payments: 1, confidence: "none", estimatedNext: new Date("2026-10-01"), summary: "" },
          }),
          summary("OLD", new Date("2026-01-01")),
        ],
        new Map(),
        now
      )
    ).toEqual([]);
  });
});

describe("incomeForecast", () => {
  it("counts the last twelve months of positions still held, and names what was sold", () => {
    const f = incomeForecast(
      [
        { ticker: "KO", instrumentName: "Coca-Cola", paidOn: new Date("2026-07-01"), amount: 5 },
        { ticker: "KO", instrumentName: "Coca-Cola", paidOn: new Date("2026-04-01"), amount: 5 },
        { ticker: "KO", instrumentName: "Coca-Cola", paidOn: new Date("2025-06-01"), amount: 5 },
        { ticker: "SOLD", instrumentName: null, paidOn: new Date("2026-05-01"), amount: 7 },
      ],
      new Set(["KO"]),
      now
    );
    expect(f).toEqual({ total: 10, byTicker: [{ ticker: "KO", instrumentName: "Coca-Cola", amount: 10 }], leftOut: 7 });
  });
});
