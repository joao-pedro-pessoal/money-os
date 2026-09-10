import { describe, expect, it } from "vitest";
import { isQuickEntryId, manualAmount, manualDate } from "../manualEntry";

describe("manual entry validation", () => {
  it("accepts a decimal comma or point without guessing thousands separators", () => {
    expect(manualAmount(" 12,30 ")).toBe("12.30");
    expect(manualAmount("12.3")).toBe("12.30");
    expect(manualAmount("0,01")).toBe("0.01");
  });
  it.each(["", "0", "-1", "1e3", "Infinity", "1,234", "1.234,56", "1,234.56", "0.001", "1000000000000"])("rejects invalid or ambiguous amount %s", value => {
    expect(() => manualAmount(value)).toThrow();
  });
  it("refuses nonexistent dates instead of rolling them into the next month", () => {
    expect(() => manualDate("2026-02-29")).toThrow();
    expect(() => manualDate("2026-13-01")).toThrow();
    expect(() => manualDate("")).toThrow();
    expect(manualDate("2024-02-29").toISOString()).toBe("2024-02-29T12:00:00.000Z");
  });
  it("limits quick undo identifiers to this entry mechanism", () => {
    expect(isQuickEntryId("quick-550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isQuickEntryId("some-existing-transaction")).toBe(false);
    expect(isQuickEntryId("quick-")).toBe(false);
  });
});
