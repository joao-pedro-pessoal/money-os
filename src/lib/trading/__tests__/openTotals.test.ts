import { describe, expect, it } from "vitest";
import { leftOut, openTotals, resultInBase, totalInBase, type ConnectionFigures } from "../openTotals";

/** Per 1 EUR, as the provider quotes. No GBP: it is the currency with no rate. */
const rates = { EUR: 1, USD: 1.25 };

const connection = (over: Partial<ConnectionFigures> = {}): ConnectionFigures => ({
  reportingCurrency: "USD",
  lastEquity: "125",
  lastSpotValue: "0",
  lastWithdrawable: "100",
  lastMarginUsed: "25",
  ...over,
});

describe("the totals on Open positions", () => {
  /**
   * Both the page and the widget used to add `toBase(...) ?? 0`, so a result
   * in a currency with no rate became a result of nothing, and the card
   * reported a smaller figure with nothing to say it was short.
   */
  it("leaves a currency with no rate out, and names it, instead of counting it as zero", () => {
    const t = openTotals(
      [
        { unrealizedPnl: 12.5, positionValue: 250, currency: "USD" },
        { unrealizedPnl: -40, positionValue: 400, currency: "GBP" },
      ],
      [],
      rates,
      "EUR"
    );
    expect(t.unrealized).toEqual({ total: 10, unconverted: ["GBP"], unstated: 0 });
    expect(t.notional.total).toBe(200);
    expect(leftOut(t.unrealized, "position")).toBe("Left out — GBP: no exchange rate");
  });

  it("converts each platform's figures from the currency it reports in", () => {
    const t = openTotals(
      [],
      [connection(), connection({ reportingCurrency: "EUR", lastEquity: "50", lastWithdrawable: "50", lastMarginUsed: null })],
      rates,
      "EUR"
    );
    expect(t.equity.total).toBe(150);
    expect(t.free.total).toBe(130);
    expect(t.margin).toEqual({ total: 20, unconverted: [], unstated: 1 });
  });

  it("reads a platform that states no currency as dollars, as the positions list does", () => {
    expect(openTotals([], [connection({ reportingCurrency: null })], rates, "EUR").equity.total).toBe(100);
  });

  /** "Nothing has been measured" must not read as "nothing has moved". */
  it("counts a position that states no result apart from one that states zero", () => {
    const t = openTotals(
      [
        { unrealizedPnl: null, positionValue: 100, currency: "EUR" },
        { unrealizedPnl: 0, positionValue: 100, currency: "EUR" },
      ],
      [],
      rates,
      "EUR"
    );
    expect(t.unrealized).toEqual({ total: 0, unconverted: [], unstated: 1 });
    expect(leftOut(t.unrealized, "position")).toBe("Left out — 1 position with no figure");
  });

  it("says nothing is left out when nothing is", () => {
    const t = totalInBase([{ a: 1 }], () => ({ amount: 1, currency: "EUR" }), rates, "EUR");
    expect(leftOut(t, "position")).toBeNull();
  });

  /** A spot-only venue states no margin because it has none; that is not a gap. */
  it("stays quiet about rows with no figure when the figure does not apply to them", () => {
    const t = openTotals([], [connection({ lastMarginUsed: null })], rates, "EUR");
    expect(leftOut(t.margin, null)).toBeNull();
  });

  it("names every missing currency once, in order", () => {
    const t = totalInBase(
      ["GBP", "JPY", "GBP"],
      (currency) => ({ amount: 1, currency }),
      rates,
      "EUR"
    );
    expect(t.unconverted).toEqual(["GBP", "JPY"]);
    expect(leftOut({ ...t, unstated: 2 }, "platform")).toBe("Left out — GBP, JPY: no exchange rate; 2 platforms with no figure");
  });
});

describe("one position's result for the widget", () => {
  it("is null, not zero, when it has no rate or states none", () => {
    expect(resultInBase({ unrealizedPnl: 5, positionValue: 1, currency: "GBP" }, rates, "EUR")).toBeNull();
    expect(resultInBase({ unrealizedPnl: null, positionValue: 1, currency: "EUR" }, rates, "EUR")).toBeNull();
    expect(resultInBase({ unrealizedPnl: 12.5, positionValue: 1, currency: "USD" }, rates, "EUR")).toBe(10);
  });
});
