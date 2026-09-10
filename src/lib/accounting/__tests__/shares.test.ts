import { describe, it, expect } from "vitest";
import { sharesOfTotal } from "../purpose";

describe("sharesOfTotal", () => {
  it("reports where the money actually is", () => {
    const out = sharesOfTotal([
      { id: "a", total: 750 },
      { id: "b", total: 250 },
    ]);
    expect(out).toEqual([
      { id: "a", percent: 75 },
      { id: "b", percent: 25 },
    ]);
  });

  it("is all zeroes when there is no money", () => {
    // Not NaN, and not an even split — nothing is in any of them.
    const out = sharesOfTotal([
      { id: "a", total: 0 },
      { id: "b", total: 0 },
    ]);
    expect(out.every((s) => s.percent === 0)).toBe(true);
  });

  it("gives an empty bucket a zero share, not a slice", () => {
    const out = sharesOfTotal([
      { id: "a", total: 1000 },
      { id: "b", total: 0 },
    ]);
    expect(out.find((s) => s.id === "b")!.percent).toBe(0);
    expect(out.find((s) => s.id === "a")!.percent).toBe(100);
  });

  it("ignores a negative total rather than inverting the split", () => {
    const out = sharesOfTotal([
      { id: "a", total: 1000 },
      { id: "b", total: -500 },
    ]);
    expect(out.find((s) => s.id === "a")!.percent).toBe(100);
    expect(out.find((s) => s.id === "b")!.percent).toBe(0);
  });

  it("handles a single bucket", () => {
    expect(sharesOfTotal([{ id: "only", total: 42 }])[0].percent).toBe(100);
  });

  it("is empty for no buckets", () => {
    expect(sharesOfTotal([])).toEqual([]);
  });

  it("rounds to two decimals", () => {
    const out = sharesOfTotal([
      { id: "a", total: 1 },
      { id: "b", total: 1 },
      { id: "c", total: 1 },
    ]);
    expect(out[0].percent).toBe(33.33);
  });

  it("describes rather than prescribes", () => {
    // The old plan asked what each bucket *should* hold and nagged about the
    // drift. This asks where the money is, which cannot be wrong.
    const out = sharesOfTotal([
      { id: "a", total: 3000 },
      { id: "b", total: 1000 },
    ]);
    const sum = out.reduce((s, x) => s + x.percent, 0);
    expect(Math.round(sum)).toBe(100);
  });
});
