import { describe, it, expect } from "vitest";
import { quoteIsStale, daysBetween, MAX_PRICE_AGE_DAYS } from "../yahoo";
import { candidateSymbols, type FigiListing } from "../openfigi";

/**
 * The bug these tests exist for.
 *
 * Eleven ETFs came back priced, in euros, from real listings of the right
 * funds, and the portfolio showed a 46 € loss on a portfolio that was up 26 €.
 * Every field was right except one nobody read: the prices were years old,
 * because the venue being asked had stopped trading and Yahoo answers a
 * dormant listing with its last print rather than with nothing.
 */
describe("refusing a price that is too old to be one", () => {
  it("accepts today's price", () => {
    expect(quoteIsStale("2026-08-20", "2026-08-20")).toBe(false);
  });

  it("accepts a price from before a long weekend", () => {
    // Friday's close read on Tuesday is normal, not suspicious.
    expect(quoteIsStale("2026-08-14", "2026-08-18")).toBe(false);
  });

  it("refuses the one that caused this", () => {
    // SXR8 was around 425 € in 2021 and around 714 € when this was written.
    // The listing was real, the currency was right, the number was a genuine
    // price — five years ago.
    expect(quoteIsStale("2021-11-05", "2026-08-20")).toBe(true);
  });

  it("draws the line where it says it does", () => {
    expect(quoteIsStale("2026-08-10", "2026-08-20", 10)).toBe(false);
    expect(quoteIsStale("2026-08-09", "2026-08-20", 10)).toBe(true);
    expect(MAX_PRICE_AGE_DAYS).toBe(10);
  });

  it("treats a date it cannot read as stale rather than as fine", () => {
    // Defaulting the other way turns the unreadable case into the silent one.
    expect(quoteIsStale("not a date", "2026-08-20")).toBe(true);
    expect(quoteIsStale("", "2026-08-20")).toBe(true);
    expect(daysBetween("nonsense", "2026-08-20")).toBeNull();
  });

  it("counts calendar days across a clock change", () => {
    // Europe moved its clocks on 2026-03-29. Dividing milliseconds by 86400000
    // makes that day 23 hours long and loses a day, which is exactly how the
    // weekly budgets ended up showing the previous week.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

/**
 * Which of six identical listings gets asked.
 *
 * Every German venue collapses to one Stooq symbol, so exactly one listing
 * survives deduplication — and it carries its exchange code forward to decide
 * which Yahoo listing is priced. Before this, the survivor was whichever one
 * OpenFIGI happened to return first.
 */
describe("preferring the venue that actually trades", () => {
  const listing = (ticker: string, exchCode: string): FigiListing => ({
    ticker,
    exchCode,
    name: "iShares Core S&P 500 UCITS ETF",
    securityType: "ETP",
  });

  it("keeps Xetra even when Berlin is listed first", () => {
    const candidates = candidateSymbols(
      [listing("SXR8", "GB"), listing("SXR8", "GH"), listing("SXR8", "GY")],
      "EUR"
    );

    // One symbol, because all three collapse to `sxr8.de` — but the exchange
    // code that survives is the one worth asking.
    expect(candidates).toHaveLength(1);
    expect(candidates[0].exchCode).toBe("GY");
  });

  it("still puts the right currency ahead of the better venue", () => {
    // A Xetra listing in euros beats a primary US listing in dollars, because
    // a wrong currency is wrong by the exchange rate and looks entirely
    // plausible.
    const candidates = candidateSymbols([listing("CSPX", "US"), listing("SXR8", "GY")], "EUR");

    expect(candidates[0].currency).toBe("EUR");
    expect(candidates[0].exchCode).toBe("GY");
  });

  it("orders the German venues sensibly when they differ in ticker", () => {
    const candidates = candidateSymbols(
      [listing("ZZZ8", "GH"), listing("SXR8", "GY"), listing("MMM8", "GR")],
      "EUR"
    );

    expect(candidates.map((c) => c.exchCode)).toEqual(["GY", "GR", "GH"]);
  });
});
