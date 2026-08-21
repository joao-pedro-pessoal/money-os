import { describe, it, expect } from "vitest";
import {
  resample,
  applyRange,
  applyView,
  changeOver,
  suggestBucket,
  isBucket,
  isRange,
  type Point,
} from "../timeframe";

/** 30 consecutive days from 1 to 30 June, value = day number. */
const june: Point[] = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-06-${String(i + 1).padStart(2, "0")}`,
  value: i + 1,
}));

describe("resample", () => {
  it("leaves a daily series alone", () => {
    expect(resample(june, "D")).toHaveLength(30);
  });

  it("keeps the last value in each bucket, not an average", () => {
    // A balance at the end of a week is a number that existed. An average of
    // daily balances is a figure you never had.
    const weekly = resample(june, "W");
    expect(weekly[weekly.length - 1].value).toBe(30);
    expect(weekly.every((p) => june.some((j) => j.date === p.date))).toBe(true);
  });

  it("counts buckets back from the newest point", () => {
    // The newest bucket is always complete at its right edge; the ragged one
    // is the oldest, which is the one you care least about.
    const weekly = resample(june, "W");
    expect(weekly[weekly.length - 1].date).toBe("2026-06-30");
  });

  it("makes weekly buckets of seven days", () => {
    const weekly = resample(june, "W");
    expect(weekly).toHaveLength(5); // 30 days = 4 full weeks + a stub
  });

  it("makes three-day buckets", () => {
    expect(resample(june, "3D")).toHaveLength(10);
  });

  it("keeps one point per calendar month", () => {
    const twoMonths = [...june, { date: "2026-07-05", value: 99 }];
    const monthly = resample(twoMonths, "M");
    expect(monthly).toHaveLength(2);
    expect(monthly[0].value).toBe(30);
    expect(monthly[1].value).toBe(99);
  });

  it("survives an unsorted input", () => {
    const shuffled = [...june].reverse();
    expect(resample(shuffled, "W")[0].date < resample(shuffled, "W")[1].date).toBe(true);
  });

  it("is empty for nothing", () => {
    expect(resample([], "W")).toEqual([]);
  });

  it("handles a single point", () => {
    expect(resample([{ date: "2026-06-01", value: 5 }], "M")).toHaveLength(1);
  });
});

describe("applyRange", () => {
  it("measures back from the data, not from today", () => {
    // A portfolio last synced a week ago should still show something for
    // "7 days" rather than an empty chart.
    const out = applyRange(june, "7d");
    expect(out[out.length - 1].date).toBe("2026-06-30");
    expect(out).toHaveLength(8); // inclusive of the cutoff day
  });

  it("returns everything for 'all'", () => {
    expect(applyRange(june, "all")).toHaveLength(30);
  });

  it("respects a custom window", () => {
    const out = applyRange(june, "custom", { from: "2026-06-10", to: "2026-06-12" });
    expect(out.map((p) => p.date)).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  it("treats an open-ended custom window as open", () => {
    expect(applyRange(june, "custom", { from: "2026-06-28", to: null })).toHaveLength(3);
    expect(applyRange(june, "custom", { from: null, to: "2026-06-02" })).toHaveLength(2);
  });

  it("is empty for nothing", () => {
    expect(applyRange([], "3m")).toEqual([]);
  });

  it("does not invent points when the range exceeds the data", () => {
    expect(applyRange(june, "1y")).toHaveLength(30);
  });
});

describe("applyView", () => {
  it("trims first, then buckets", () => {
    // Bucketing first would group points that the range excludes and shift
    // every boundary.
    const out = applyView(june, { bucket: "W", range: "7d" });
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[out.length - 1].date).toBe("2026-06-30");
  });
});

describe("changeOver", () => {
  it("reports the change across what's shown", () => {
    const c = changeOver(applyView(june, { bucket: "D", range: "7d" }));
    expect(c?.from).toBe(23);
    expect(c?.to).toBe(30);
    expect(c?.change).toBe(7);
  });

  it("needs two points to say anything", () => {
    expect(changeOver([{ date: "2026-06-01", value: 5 }])).toBeNull();
    expect(changeOver([])).toBeNull();
  });

  it("does not divide by zero from an empty start", () => {
    const c = changeOver([
      { date: "2026-06-01", value: 0 },
      { date: "2026-06-02", value: 50 },
    ]);
    expect(c?.percent).toBeNull();
    expect(c?.change).toBe(50);
  });

  it("reports a fall as negative", () => {
    const c = changeOver([
      { date: "2026-06-01", value: 100 },
      { date: "2026-06-02", value: 80 },
    ]);
    expect(c?.percent).toBe(-20);
  });
});

describe("suggestBucket", () => {
  it("keeps short ranges daily and long ranges coarse", () => {
    // A year of daily points is 365 dots on a chart 600 pixels wide.
    expect(suggestBucket("7d")).toBe("D");
    expect(suggestBucket("3m")).toBe("3D");
    expect(suggestBucket("1y")).toBe("M");
  });
});

describe("guards", () => {
  it("recognises valid values only", () => {
    expect(isBucket("W")).toBe(true);
    expect(isBucket("Y")).toBe(false);
    expect(isRange("3m")).toBe(true);
    expect(isRange("3y")).toBe(false);
  });
});
