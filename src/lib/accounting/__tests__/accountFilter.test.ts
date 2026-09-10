import { describe, it, expect } from "vitest";
import {
  applyAccountFilters,
  filterOptions,
  isEmptyAccount,
  DEFAULT_FILTERS,
  type FilterableAccount,
} from "../accountFilter";

const acc = (o: Partial<FilterableAccount> & { id: string }): FilterableAccount => ({
  name: o.id,
  institution: "Bank",
  accountType: "bank",
  currency: "EUR",
  displayValue: 0,
  baseValue: 0,
  free: 0,
  connected: false,
  ...o,
});

describe("isEmptyAccount", () => {
  it("is true only when both balance and free are zero", () => {
    expect(isEmptyAccount(acc({ id: "a" }))).toBe(true);
    expect(isEmptyAccount(acc({ id: "a", displayValue: 1 }))).toBe(false);
    expect(isEmptyAccount(acc({ id: "a", free: 1 }))).toBe(false);
  });

  it("does not hide a negative balance", () => {
    // An overdrawn account is the last thing that should quietly disappear.
    expect(isEmptyAccount(acc({ id: "a", displayValue: -50 }))).toBe(false);
  });
});

describe("applyAccountFilters", () => {
  const list = [
    acc({ id: "t212", name: "T212", displayValue: 100, baseValue: 100, free: 1 }),
    acc({ id: "byb1", name: "Bybit", institution: "Bybit", accountType: "exchange", currency: "USD" }),
    acc({ id: "byb2", name: "Bybit", institution: "Bybit", accountType: "exchange", currency: "USD" }),
    acc({
      id: "hl",
      name: "Hyperliquid",
      institution: "Hyperliquid",
      accountType: "exchange",
      currency: "USD",
      displayValue: 123.67,
      baseValue: 107.22,
      free: 24.91,
      connected: true,
    }),
  ];

  it("hides empty accounts by default", () => {
    const rows = applyAccountFilters(list, DEFAULT_FILTERS);
    // Both Bybit rows drop out; Hyperliquid leads because 107.22 € beats
    // 100 € — the ordering is on the converted value, not the raw 123.67.
    expect(rows.map((r) => r.id)).toEqual(["hl", "t212"]);
  });

  it("shows everything when hideEmpty is off", () => {
    expect(applyAccountFilters(list, { ...DEFAULT_FILTERS, hideEmpty: false })).toHaveLength(4);
  });

  it("sorts by converted value, not the raw number", () => {
    // 123.67 USD is worth 107.22 EUR, which is more than 100 EUR — but a naive
    // sort on displayValue would be right here by accident, so use a case
    // where the two disagree.
    const usdLooksBigger = [
      acc({ id: "eur", displayValue: 100, baseValue: 100 }),
      acc({ id: "usd", displayValue: 110, baseValue: 95, currency: "USD" }),
    ];
    const rows = applyAccountFilters(usdLooksBigger, DEFAULT_FILTERS);
    expect(rows.map((r) => r.id)).toEqual(["eur", "usd"]);
  });

  it("sinks accounts with no exchange rate to the bottom", () => {
    const rows = applyAccountFilters(
      [
        acc({ id: "unknown", displayValue: 999, baseValue: null, currency: "XYZ" }),
        acc({ id: "known", displayValue: 1, baseValue: 1 }),
      ],
      DEFAULT_FILTERS
    );
    // Worth 999 of something, but unconvertible — it must not claim the top
    // spot, and must not be treated as zero either.
    expect(rows.map((r) => r.id)).toEqual(["known", "unknown"]);
  });

  it("filters by type, currency and search text", () => {
    const base = { ...DEFAULT_FILTERS, hideEmpty: false };
    expect(applyAccountFilters(list, { ...base, type: "bank" }).map((r) => r.id)).toEqual(["t212"]);
    expect(applyAccountFilters(list, { ...base, currency: "USD" })).toHaveLength(3);
    expect(applyAccountFilters(list, { ...base, query: "bybit" })).toHaveLength(2);
    expect(applyAccountFilters(list, { ...base, query: "  BYBIT " })).toHaveLength(2);
  });

  it("matches the institution as well as the name", () => {
    const rows = applyAccountFilters(
      [acc({ id: "x", name: "Main", institution: "Revolut" })],
      { ...DEFAULT_FILTERS, hideEmpty: false, query: "revolut" }
    );
    expect(rows).toHaveLength(1);
  });

  it("filters to synced accounts only", () => {
    const rows = applyAccountFilters(list, { ...DEFAULT_FILTERS, connectedOnly: true });
    expect(rows.map((r) => r.id)).toEqual(["hl"]);
  });

  it("sorts by name in both directions", () => {
    const asc = applyAccountFilters(list, {
      ...DEFAULT_FILTERS,
      hideEmpty: false,
      sort: "name",
      dir: "asc",
    });
    expect(asc[0].name).toBe("Bybit");
    const desc = applyAccountFilters(list, {
      ...DEFAULT_FILTERS,
      hideEmpty: false,
      sort: "name",
      dir: "desc",
    });
    expect(desc[0].name).toBe("T212");
  });

  it("does not mutate the input array", () => {
    const original = [...list];
    applyAccountFilters(list, { ...DEFAULT_FILTERS, sort: "name" });
    expect(list).toEqual(original);
  });
});

describe("filterOptions", () => {
  it("offers each type and currency once", () => {
    const o = filterOptions([
      acc({ id: "a", accountType: "bank", currency: "EUR" }),
      acc({ id: "b", accountType: "exchange", currency: "USD" }),
      acc({ id: "c", accountType: "exchange", currency: "USD" }),
    ]);
    expect(o.types).toEqual(["bank", "exchange"]);
    expect(o.currencies).toEqual(["EUR", "USD"]);
  });
});
