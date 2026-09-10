import { describe, it, expect } from "vitest";
import {
  inferRhythm,
  summariseByTicker,
  summariseByYear,
  upcomingEstimates,
  trailingYield,
  totalReceived,
  isInterest,
  isManufactured,
  type DividendPayment,
} from "../dividends";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

const pay = (ticker: string, iso: string, amount: number, over: Partial<DividendPayment> = {}): DividendPayment => ({
  ticker,
  paidOn: d(iso),
  amount,
  currency: "EUR",
  ...over,
});

describe("telling kinds of income apart", () => {
  it("recognises interest on cash", () => {
    expect(isInterest("INTEREST")).toBe(true);
    expect(isInterest("INTEREST_PAID_BY_US_OBLIGORS")).toBe(true);
    expect(isInterest("ORDINARY")).toBe(false);
    expect(isInterest(null)).toBe(false);
  });

  it("recognises a payment made on the issuer's behalf", () => {
    expect(isManufactured("DIVIDEND_MANUFACTURED_PAYMENT")).toBe(true);
    expect(isManufactured("DIVIDEND")).toBe(false);
  });
});

describe("the rhythm of payments", () => {
  it("says nothing at all from a single payment", () => {
    const r = inferRhythm([d("2026-03-01")]);
    expect(r.cadence).toBeNull();
    expect(r.estimatedNext).toBeNull();
    expect(r.confidence).toBe("none");
  });

  it("says nothing from no payments", () => {
    expect(inferRhythm([]).payments).toBe(0);
    expect(inferRhythm([]).estimatedNext).toBeNull();
  });

  it("recognises a quarterly payer", () => {
    const r = inferRhythm([d("2025-02-14"), d("2025-05-15"), d("2025-08-14"), d("2025-11-14")]);
    expect(r.cadence).toBe("quarterly");
    expect(r.confidence).toBe("good");
  });

  it("recognises a monthly payer", () => {
    const r = inferRhythm([d("2026-01-05"), d("2026-02-05"), d("2026-03-05"), d("2026-04-05")]);
    expect(r.cadence).toBe("monthly");
  });

  it("recognises an annual payer", () => {
    const r = inferRhythm([d("2023-06-01"), d("2024-06-03"), d("2025-05-30")]);
    expect(r.cadence).toBe("annual");
  });

  it("estimates the next payment one gap after the last", () => {
    const r = inferRhythm([d("2025-05-15"), d("2025-08-14"), d("2025-11-14"), d("2026-02-13")]);
    expect(r.estimatedNext!.getUTCFullYear()).toBe(2026);
    expect(r.estimatedNext!.getUTCMonth()).toBe(4); // May
  });

  it("is not fooled by one late payment", () => {
    // The mean gap here is pulled well past a quarter; the median isn't.
    const r = inferRhythm([
      d("2025-01-10"),
      d("2025-04-10"),
      d("2025-07-10"),
      d("2026-04-10"),
    ]);
    expect(r.cadence).toBe("quarterly");
  });

  it("admits when payments are irregular", () => {
    const r = inferRhythm([d("2025-01-01"), d("2025-03-20"), d("2025-11-02")]);
    expect(r.cadence).toBeNull();
    expect(r.summary).toMatch(/irregular/i);
  });

  it("gives two payments low confidence but still an estimate", () => {
    const r = inferRhythm([d("2025-06-01"), d("2025-09-01")]);
    expect(r.confidence).toBe("low");
    expect(r.estimatedNext).not.toBeNull();
  });

  it("always says the date is an estimate, never an announcement", () => {
    // The whole reason this is allowed to exist: it must never read like a
    // company announcement. No platform publishes a forward calendar here.
    for (const dates of [
      [d("2025-02-01"), d("2025-05-01"), d("2025-08-01"), d("2025-11-01")],
      [d("2025-01-01"), d("2025-03-20"), d("2025-11-02")],
    ]) {
      expect(inferRhythm(dates).summary).toMatch(/estimate|not an announced date/i);
    }
  });

  it("doesn't care what order the dates arrive in", () => {
    const forwards = inferRhythm([d("2025-02-01"), d("2025-05-01"), d("2025-08-01")]);
    const backwards = inferRhythm([d("2025-08-01"), d("2025-02-01"), d("2025-05-01")]);
    expect(backwards.cadence).toBe(forwards.cadence);
    expect(backwards.estimatedNext).toEqual(forwards.estimatedNext);
  });
});

describe("per ticker", () => {
  const payments = [
    pay("VWCE_EQ", "2025-06-01", 12.5, { instrumentName: "Vanguard FTSE All-World" }),
    pay("VWCE_EQ", "2025-12-01", 14.25),
    pay("SHEL_EQ", "2026-01-15", 8),
    pay("EUR", "2026-02-01", 0.11, { type: "INTEREST" }),
  ];

  it("totals what each one paid", () => {
    const byTicker = summariseByTicker(payments);
    const vwce = byTicker.find((t) => t.ticker === "VWCE_EQ")!;
    expect(vwce.total).toBe(26.75);
    expect(vwce.payments).toBe(2);
  });

  it("keeps the name even when only one payment carried it", () => {
    const vwce = summariseByTicker(payments).find((t) => t.ticker === "VWCE_EQ")!;
    expect(vwce.instrumentName).toBe("Vanguard FTSE All-World");
  });

  it("puts the most recently paid first", () => {
    expect(summariseByTicker(payments)[0].ticker).toBe("EUR");
  });

  it("flags income that is interest on cash rather than a distribution", () => {
    // Both are money received, but only one says anything about a holding.
    const eur = summariseByTicker(payments).find((t) => t.ticker === "EUR")!;
    expect(eur.interestOnly).toBe(true);
    const shel = summariseByTicker(payments).find((t) => t.ticker === "SHEL_EQ")!;
    expect(shel.interestOnly).toBe(false);
  });

  it("reports first and last payment dates", () => {
    const vwce = summariseByTicker(payments).find((t) => t.ticker === "VWCE_EQ")!;
    expect(vwce.firstPaidOn).toEqual(d("2025-06-01"));
    expect(vwce.lastPaidOn).toEqual(d("2025-12-01"));
    expect(vwce.lastAmount).toBe(14.25);
  });

  it("returns nothing for an empty history", () => {
    expect(summariseByTicker([])).toEqual([]);
  });
});

describe("per year", () => {
  it("totals each calendar year, newest first", () => {
    const years = summariseByYear([
      pay("A", "2024-03-01", 10),
      pay("A", "2025-03-01", 20),
      pay("B", "2025-09-01", 5),
    ]);
    expect(years).toEqual([
      { year: 2025, total: 25, payments: 2 },
      { year: 2024, total: 10, payments: 1 },
    ]);
  });

  it("rounds money to cents", () => {
    const years = summariseByYear([pay("A", "2025-01-01", 0.1), pay("A", "2025-02-01", 0.2)]);
    expect(years[0].total).toBe(0.3);
  });
});

describe("what's expected next", () => {
  const now = d("2026-03-01");

  it("lists estimates that are still ahead, soonest first", () => {
    const summaries = summariseByTicker([
      pay("Q", "2025-06-01", 1),
      pay("Q", "2025-09-01", 1),
      pay("Q", "2025-12-01", 1),
      pay("Q", "2026-03-01", 1),
      pay("Y", "2024-01-10", 5),
      pay("Y", "2025-01-10", 5),
      pay("Y", "2026-01-10", 5),
    ]);
    const next = upcomingEstimates(summaries, now);
    expect(next.map((s) => s.ticker)).toEqual(["Q", "Y"]);
  });

  it("drops an estimate that has already come and gone", () => {
    // A payment that "should have arrived last month" isn't a forecast — it's
    // a sign the pattern broke, and showing it as upcoming would be a lie.
    const summaries = summariseByTicker([pay("OLD", "2023-01-01", 1), pay("OLD", "2023-04-01", 1)]);
    expect(upcomingEstimates(summaries, now)).toEqual([]);
  });

  it("ignores a ticker paid only once", () => {
    const summaries = summariseByTicker([pay("ONCE", "2026-02-01", 3)]);
    expect(upcomingEstimates(summaries, now)).toEqual([]);
  });
});

describe("trailing yield", () => {
  const now = d("2026-03-01");

  it("measures the last twelve months against the current value", () => {
    const y = trailingYield([pay("A", "2025-06-01", 30), pay("A", "2025-12-01", 30)], 2000, now);
    expect(y).toBe(3);
  });

  it("excludes anything older than a year", () => {
    const y = trailingYield([pay("A", "2024-01-01", 100), pay("A", "2025-12-01", 30)], 1000, now);
    expect(y).toBe(3);
  });

  it("is null without a value to divide by, rather than zero", () => {
    // Zero would read as "this pays nothing", which is a different claim.
    expect(trailingYield([pay("A", "2025-12-01", 30)], null, now)).toBeNull();
    expect(trailingYield([pay("A", "2025-12-01", 30)], 0, now)).toBeNull();
  });

  it("is null when nothing was paid in the window", () => {
    expect(trailingYield([pay("A", "2020-01-01", 30)], 1000, now)).toBeNull();
  });
});

describe("totals", () => {
  it("adds everything up to the cent", () => {
    expect(totalReceived([pay("A", "2025-01-01", 0.1), pay("A", "2025-02-01", 0.2)])).toBe(0.3);
  });

  it("is zero for an empty history", () => {
    expect(totalReceived([])).toBe(0);
  });
});
