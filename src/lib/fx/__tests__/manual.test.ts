import { describe, expect, it } from "vitest";
import { manualRate } from "../manual";

describe("exact manual exchange rates within numeric(20,10)", () => {
  it.each([
    [" usd ", "001,2500000000", "USD", "1.25"],
    ["GBP", "0.0000000001", "GBP", "0.0000000001"],
    ["CHF", "9999999999.9999999999", "CHF", "9999999999.9999999999"],
  ])("keeps the exact decimal for %s %s", (code, value, quote, rate) => {
    expect(manualRate(code, value)).toEqual({ quote, rate });
  });
  it.each(["", "0", "0,0000000000", "-1", "Infinity", "NaN", "1e-10", "0.00000000001", "10000000000", "1.23456789012", "1,234.50", "1 234", "1\u0000"])("refuses %j without rounding or coercion", value => {
    expect(() => manualRate("USD", value)).toThrow();
  });
  it.each(["", "US", "USDT", "€", "USD\nXYZ"])("refuses an invalid currency %j", code => {
    expect(() => manualRate(code, "1")).toThrow();
  });
  it("keeps the reference at one", () => { expect(() => manualRate(" eur ", "1")).toThrow(/EUR/); });
});
