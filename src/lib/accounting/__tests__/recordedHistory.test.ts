import { describe, expect, it } from "vitest";
import { recordedHistory } from "../recordedHistory";

describe("a history without separate debt balances", () => {
  it("compares recorded assets to recorded assets, including real zero values", () => {
    const points = [{ date: "2026-01-01", value: 0 }, { date: "2026-02-01", value: 1200 }];
    expect(recordedHistory(points)).toEqual({ basis: "recorded-assets", latestValue: 1200, change: 1200, latestDate: "2026-02-01" });
    expect(points).toEqual([{ date: "2026-01-01", value: 0 }, { date: "2026-02-01", value: 1200 }]);
  });
  it("preserves a measured fall", () => {
    expect(recordedHistory([{ date: "2026-01-01", value: 1200 }, { date: "2026-02-01", value: 800 }]).change).toBe(-400);
  });
  it("does not turn absent history into zero or invent a change from one point", () => {
    expect(recordedHistory([])).toMatchObject({ latestValue: null, change: null });
    expect(recordedHistory([{ date: "2026-01-01", value: 0 }])).toMatchObject({ latestValue: 0, change: null });
  });
  it("uses the period arbiter's ordering and does not publish non-finite measurements", () => {
    expect(recordedHistory([{ date: "2026-02-01", value: 800 }, { date: "2026-01-01", value: 1200 }])).toMatchObject({ latestValue: 800, change: -400 });
    expect(recordedHistory([{ date: "2026-01-01", value: NaN }])).toMatchObject({ latestValue: null, change: null });
  });
});
