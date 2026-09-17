import { describe, expect, it } from "vitest";
import { downsample, topPositions, topSlices } from "../summary";

describe("downsample", () => {
  const series = Array.from({ length: 100 }, (_, i) => ({ date: `d${i}`, value: i + 0.004 }));

  it("keeps a short series as it is, rounded to cents", () => {
    expect(downsample(series.slice(0, 3), 10)).toEqual([
      { date: "d0", value: 0 },
      { date: "d1", value: 1 },
      { date: "d2", value: 2 },
    ]);
  });

  it("never returns more than asked", () => {
    expect(downsample(series, 30)).toHaveLength(30);
  });

  it("keeps the first and the last point, so the line ends on today's figure", () => {
    const picked = downsample(series, 30);
    expect(picked[0].date).toBe("d0");
    expect(picked.at(-1)!.date).toBe("d99");
  });
});

describe("topSlices", () => {
  it("folds everything past the largest into Other", () => {
    expect(
      topSlices(
        [
          { name: "A", value: 10 },
          { name: "B", value: 50 },
          { name: "C", value: 5 },
          { name: "D", value: 1 },
        ],
        2
      )
    ).toEqual([
      { name: "B", value: 50 },
      { name: "A", value: 10 },
      { name: "Other", value: 6 },
    ]);
  });

  it("leaves out empty and negative accounts", () => {
    expect(
      topSlices(
        [
          { name: "A", value: 0 },
          { name: "B", value: -20 },
          { name: "C", value: 3 },
        ],
        5
      )
    ).toEqual([{ name: "C", value: 3 }]);
  });

  it("has no Other when nothing is left over", () => {
    expect(topSlices([{ name: "A", value: 1 }], 1)).toEqual([{ name: "A", value: 1 }]);
  });
});

describe("topPositions", () => {
  it("lists the largest first and keeps an unmeasured result as null, not zero", () => {
    expect(
      topPositions(
        [
          { name: "Cash", value: 500, pnl: 0, measured: false },
          { name: "VWCE", value: 900, pnl: 42.456, measured: true },
          { name: "Tiny", value: 1, pnl: 0.1, measured: true },
          { name: "Gone", value: 0, pnl: 0, measured: true },
        ],
        2
      )
    ).toEqual([
      { name: "VWCE", value: 900, pnl: 42.46 },
      { name: "Cash", value: 500, pnl: null },
    ]);
  });
});
