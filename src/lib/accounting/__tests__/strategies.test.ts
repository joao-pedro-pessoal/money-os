import { describe, it, expect } from "vitest";
import {
  weightsFromPriority,
  largestRemainder,
  distributeByPercent,
  normaliseShares,
  planWith,
  type DistributableBucket,
  type Share,
} from "../distribute";

const b = (o: Partial<DistributableBucket> & { id: string }): DistributableBucket => ({
  name: o.id,
  priority: 0,
  current: 0,
  target: null,
  ...o,
});

const sum = (shares: Share[]) => Math.round(shares.reduce((s, x) => s + x.percent, 0) * 100) / 100;

describe("weightsFromPriority", () => {
  it("gives the top rank the biggest share", () => {
    // Four ranks: 4/3/2/1 shares out of 10.
    const shares = weightsFromPriority([
      { id: "a", name: "A", priority: 0 },
      { id: "b", name: "B", priority: 1 },
      { id: "c", name: "C", priority: 2 },
      { id: "d", name: "D", priority: 3 },
    ]);
    expect(shares.map((s) => s.percent)).toEqual([40, 30, 20, 10]);
  });

  it("gives equal shares to equal priorities", () => {
    // The whole reason ties are allowed: "these two matter the same".
    const shares = weightsFromPriority([
      { id: "a", name: "A", priority: 0 },
      { id: "b", name: "B", priority: 0 },
      { id: "c", name: "C", priority: 1 },
    ]);
    expect(shares.find((s) => s.id === "a")!.percent).toBe(
      shares.find((s) => s.id === "b")!.percent
    );
    expect(shares.find((s) => s.id === "c")!.percent).toBeLessThan(
      shares.find((s) => s.id === "a")!.percent
    );
  });

  it("splits evenly when every goal has the same priority", () => {
    const shares = weightsFromPriority([
      { id: "a", name: "A", priority: 2 },
      { id: "b", name: "B", priority: 2 },
    ]);
    expect(shares.map((s) => s.percent)).toEqual([50, 50]);
  });

  it("always sums to exactly 100", () => {
    // Three-way splits are where naive rounding produces 99.99.
    for (const n of [1, 2, 3, 6, 7, 11, 13]) {
      const buckets = Array.from({ length: n }, (_, i) => ({
        id: `b${i}`,
        name: `B${i}`,
        priority: i,
      }));
      expect(sum(weightsFromPriority(buckets))).toBe(100);
    }
  });

  it("handles a single goal", () => {
    expect(weightsFromPriority([{ id: "a", name: "A", priority: 5 }])[0].percent).toBe(100);
  });

  it("is empty for no goals", () => {
    expect(weightsFromPriority([])).toEqual([]);
  });

  it("ignores the absolute numbers, only the gaps matter", () => {
    const low = weightsFromPriority([
      { id: "a", name: "A", priority: 0 },
      { id: "b", name: "B", priority: 1 },
    ]);
    const high = weightsFromPriority([
      { id: "a", name: "A", priority: 10 },
      { id: "b", name: "B", priority: 11 },
    ]);
    expect(low.map((s) => s.percent)).toEqual(high.map((s) => s.percent));
  });
});

describe("largestRemainder", () => {
  it("keeps a three-way split at 100", () => {
    const out = largestRemainder([
      { id: "a", name: "A", raw: 100 / 3 },
      { id: "b", name: "B", raw: 100 / 3 },
      { id: "c", name: "C", raw: 100 / 3 },
    ]);
    expect(sum(out)).toBe(100);
  });

  it("gives the spare cent to the largest remainder", () => {
    const out = largestRemainder([
      { id: "big", name: "Big", raw: 66.666 },
      { id: "small", name: "Small", raw: 33.334 },
    ]);
    expect(sum(out)).toBe(100);
  });
});

describe("distributeByPercent", () => {
  const goals = [
    b({ id: "a", name: "A", priority: 0, current: 0, target: 1000 }),
    b({ id: "b", name: "B", priority: 1, current: 0, target: 1000 }),
  ];
  const half: Share[] = [
    { id: "a", name: "A", percent: 50 },
    { id: "b", name: "B", percent: 50 },
  ];

  it("splits by the percentages", () => {
    const d = distributeByPercent(200, goals, half);
    expect(d.moves.map((m) => m.amount)).toEqual([100, 100]);
  });

  it("gives every goal something, unlike the waterfall", () => {
    const d = distributeByPercent(200, goals, half);
    expect(d.moves).toHaveLength(2);
  });

  it("caps a share at what the goal still needs", () => {
    const nearlyFull = [
      b({ id: "a", name: "A", priority: 0, current: 950, target: 1000 }),
      b({ id: "b", name: "B", priority: 1, current: 0, target: 1000 }),
    ];
    const d = distributeByPercent(200, nearlyFull, half);
    // A can only take 50; the other 150 goes to B rather than overshooting.
    expect(d.moves.find((m) => m.bucketId === "a")!.amount).toBe(50);
    expect(d.moves.find((m) => m.bucketId === "b")!.amount).toBe(150);
    expect(d.distributed).toBe(200);
  });

  it("does not overshoot a target", () => {
    const d = distributeByPercent(5000, goals, half);
    for (const m of d.moves) {
      const goal = goals.find((g) => g.id === m.bucketId)!;
      expect(m.after).toBeLessThanOrEqual(goal.target!);
    }
  });

  it("reports what is left when every goal is full", () => {
    const d = distributeByPercent(5000, goals, half);
    expect(d.distributed).toBe(2000);
    expect(d.leftOver).toBe(3000);
  });

  it("keeps feeding a bottomless goal", () => {
    const withOpen = [...goals, b({ id: "open", name: "Open", priority: 2, target: null })];
    const shares: Share[] = [
      { id: "a", name: "A", percent: 33.34 },
      { id: "b", name: "B", percent: 33.33 },
      { id: "open", name: "Open", percent: 33.33 },
    ];
    const d = distributeByPercent(10000, withOpen, shares);
    expect(d.leftOver).toBe(0);
    expect(d.moves.find((m) => m.bucketId === "open")!.amount).toBe(8000);
  });

  it("never distributes more than it was given", () => {
    for (const amount of [1, 199, 200, 1999, 2000, 2001]) {
      expect(distributeByPercent(amount, goals, half).distributed).toBeLessThanOrEqual(amount);
    }
  });

  it("skips a goal given a zero share", () => {
    const d = distributeByPercent(200, goals, [
      { id: "a", name: "A", percent: 100 },
      { id: "b", name: "B", percent: 0 },
    ]);
    expect(d.moves).toHaveLength(1);
    expect(d.moves[0].bucketId).toBe("a");
  });

  it("plans nothing for nothing", () => {
    expect(distributeByPercent(0, goals, half).moves).toEqual([]);
    expect(distributeByPercent(-100, goals, half).moves).toEqual([]);
  });

  it("terminates when no goal can take anything", () => {
    const full = [b({ id: "a", name: "A", current: 1000, target: 1000 })];
    const d = distributeByPercent(500, full, [{ id: "a", name: "A", percent: 100 }]);
    expect(d.moves).toEqual([]);
    expect(d.leftOver).toBe(500);
  });
});

describe("planWith", () => {
  const goals = [
    b({ id: "a", name: "A", priority: 0, current: 0, target: 1000 }),
    b({ id: "b", name: "B", priority: 1, current: 0, target: 1000 }),
  ];
  const shares = weightsFromPriority([
    { id: "a", name: "A", priority: 0 },
    { id: "b", name: "B", priority: 1 },
  ]);

  it("waterfall fills one goal before the next", () => {
    const d = planWith("waterfall", 200, goals, shares);
    expect(d.moves).toHaveLength(1);
  });

  it("priority spreads across both", () => {
    const d = planWith("priority", 200, goals, shares);
    expect(d.moves).toHaveLength(2);
    // 2/3 and 1/3 of 200.
    expect(d.moves[0].amount).toBeCloseTo(133.33, 1);
  });

  it("manual uses the shares it was handed", () => {
    const d = planWith("manual", 200, goals, [
      { id: "a", name: "A", percent: 10 },
      { id: "b", name: "B", percent: 90 },
    ]);
    expect(d.moves.find((m) => m.bucketId === "b")!.amount).toBe(180);
  });
});

describe("normaliseShares", () => {
  it("scales hand-edited numbers back to 100", () => {
    const out = normaliseShares([
      { id: "a", name: "A", percent: 30 },
      { id: "b", name: "B", percent: 30 },
    ]);
    expect(sum(out)).toBe(100);
    expect(out[0].percent).toBe(50);
  });

  it("keeps the proportions", () => {
    const out = normaliseShares([
      { id: "a", name: "A", percent: 75 },
      { id: "b", name: "B", percent: 25 },
    ]);
    expect(out[0].percent).toBe(75);
  });

  it("treats a negative as zero rather than reversing the split", () => {
    const out = normaliseShares([
      { id: "a", name: "A", percent: -50 },
      { id: "b", name: "B", percent: 50 },
    ]);
    expect(out.find((s) => s.id === "a")!.percent).toBe(0);
    expect(out.find((s) => s.id === "b")!.percent).toBe(100);
  });

  it("falls back to an even split when everything is zero", () => {
    const out = normaliseShares([
      { id: "a", name: "A", percent: 0 },
      { id: "b", name: "B", percent: 0 },
    ]);
    expect(out.map((s) => s.percent)).toEqual([50, 50]);
  });
});
