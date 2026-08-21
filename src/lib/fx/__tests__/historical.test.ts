import { describe, it, expect } from "vitest";
import {
  freezeConversion,
  seriesFromSnapshots,
  approximateCount,
  type SnapshotRow,
} from "../historical";

describe("freezeConversion", () => {
  it("stores the rate that produced the value", () => {
    const f = freezeConversion({
      value: 100,
      currency: "USD",
      baseCurrency: "EUR",
      rate: 0.92,
      rateSource: "frankfurter",
      rateDate: new Date("2026-03-01"),
    });
    expect(f.valueInBase).toBe(92);
    expect(f.rate).toBe(0.92);
    expect(f.rateSource).toBe("frankfurter");
  });

  it("uses rate 1 for the base currency without inventing a source", () => {
    const f = freezeConversion({ value: 100, currency: "EUR", baseCurrency: "EUR", rate: null });
    expect(f.valueInBase).toBe(100);
    expect(f.rate).toBe(1);
    expect(f.rateSource).toBe("identity");
    expect(f.rateDate).toBeNull();
  });

  it("stores null, not zero, when no rate exists", () => {
    // Zero would drag the chart to the floor and look like the money vanished.
    const f = freezeConversion({ value: 100, currency: "XYZ", baseCurrency: "EUR", rate: null });
    expect(f.valueInBase).toBeNull();
    expect(f.originalValue).toBe(100);
  });

  it("keeps the original amount and currency alongside the conversion", () => {
    const f = freezeConversion({ value: 123.674, currency: "USD", baseCurrency: "EUR", rate: 0.9 });
    expect(f.originalValue).toBe(123.67);
    expect(f.originalCurrency).toBe("USD");
    expect(f.baseCurrency).toBe("EUR");
  });
});

describe("seriesFromSnapshots", () => {
  const snap = (o: Partial<SnapshotRow> & { timestamp: Date }): SnapshotRow => ({
    accountId: "a1",
    balance: 100,
    currency: "USD",
    valueInBase: null,
    rate: null,
    baseCurrency: "EUR",
    backfilled: false,
    ...o,
  });

  // Today's rate is deliberately different from the rates of the day, so a
  // test can tell which one was used.
  const todayRate = (c: string) => (c === "USD" ? 0.8 : c === "EUR" ? 1 : null);

  it("uses the frozen value, not today's rate", () => {
    const series = seriesFromSnapshots(
      [snap({ timestamp: new Date("2026-03-01"), balance: 100, valueInBase: 92, rate: 0.92 })],
      todayRate
    );
    // $100 was worth €92 in March. Today's rate would say €80.
    expect(series[0].value).toBe(92);
    expect(series[0].approximate).toBe(false);
  });

  it("falls back to today's rate for old rows and marks them", () => {
    const series = seriesFromSnapshots(
      [snap({ timestamp: new Date("2026-03-01"), backfilled: true })],
      todayRate
    );
    expect(series[0].value).toBe(80);
    expect(series[0].approximate).toBe(true);
  });

  it("does not silently mix the two", () => {
    const series = seriesFromSnapshots(
      [
        snap({ timestamp: new Date("2026-03-01"), valueInBase: 92, rate: 0.92 }),
        snap({ timestamp: new Date("2026-04-01"), backfilled: true }),
      ],
      todayRate
    );
    expect(series.map((p) => p.approximate)).toEqual([false, true]);
    expect(approximateCount(series)).toBe(1);
  });

  it("sums several accounts on the same day", () => {
    const series = seriesFromSnapshots(
      [
        snap({ accountId: "a", timestamp: new Date("2026-03-01T09:00:00Z"), valueInBase: 92 }),
        snap({ accountId: "b", timestamp: new Date("2026-03-01T18:00:00Z"), valueInBase: 8 }),
      ],
      todayRate
    );
    expect(series).toHaveLength(1);
    expect(series[0].value).toBe(100);
  });

  it("replaces rather than adds when one account is updated twice in a day", () => {
    const series = seriesFromSnapshots(
      [
        snap({ accountId: "a", timestamp: new Date("2026-03-01T09:00:00Z"), valueInBase: 92 }),
        snap({ accountId: "a", timestamp: new Date("2026-03-01T18:00:00Z"), valueInBase: 50 }),
      ],
      todayRate
    );
    // The second update corrected the first; it did not add to it.
    expect(series[0].value).toBe(50);
  });

  it("carries an untouched account forward", () => {
    const series = seriesFromSnapshots(
      [
        snap({ accountId: "bank", timestamp: new Date("2026-03-01"), valueInBase: 1000 }),
        snap({ accountId: "broker", timestamp: new Date("2026-04-01"), valueInBase: 500 }),
      ],
      todayRate
    );
    // On 1 April the bank still holds 1 000 — it just wasn't touched that day.
    expect(series.map((p) => p.value)).toEqual([1000, 1500]);
  });

  it("marks the whole day approximate if any account in it is", () => {
    const series = seriesFromSnapshots(
      [
        snap({ accountId: "a", timestamp: new Date("2026-03-01T09:00:00Z"), valueInBase: 92 }),
        snap({
          accountId: "b",
          timestamp: new Date("2026-03-01T18:00:00Z"),
          backfilled: true,
          balance: 10,
        }),
      ],
      todayRate
    );
    expect(series[0].approximate).toBe(true);
  });

  it("drops a point it genuinely cannot value rather than calling it zero", () => {
    const series = seriesFromSnapshots(
      [snap({ timestamp: new Date("2026-03-01"), currency: "XYZ", backfilled: true })],
      todayRate
    );
    expect(series).toHaveLength(0);
  });

  it("sorts by date", () => {
    const series = seriesFromSnapshots(
      [
        snap({ timestamp: new Date("2026-05-01"), valueInBase: 3 }),
        snap({ timestamp: new Date("2026-03-01"), valueInBase: 1 }),
        snap({ timestamp: new Date("2026-04-01"), valueInBase: 2 }),
      ],
      todayRate
    );
    expect(series.map((p) => p.value)).toEqual([1, 2, 3]);
  });

  it("is empty for no snapshots", () => {
    expect(seriesFromSnapshots([], todayRate)).toEqual([]);
  });

  it("reproduces the bug it was written to fix", () => {
    // A dollar account held flat at $100 all year. The rate moved from 0.92 to
    // 0.80. Converting the history at today's rate draws a flat €80 line and
    // erases a real €12 loss of purchasing power.
    const rows = [
      snap({ accountId: "usd", timestamp: new Date("2026-01-01"), valueInBase: 92, rate: 0.92 }),
      snap({ accountId: "usd", timestamp: new Date("2026-08-01"), valueInBase: 80, rate: 0.8 }),
    ];
    const series = seriesFromSnapshots(rows, todayRate);
    expect(series.map((p) => p.value)).toEqual([92, 80]);
    // The old behaviour would have produced [80, 80].
    expect(series[0].value).not.toBe(series[1].value);
  });
});
