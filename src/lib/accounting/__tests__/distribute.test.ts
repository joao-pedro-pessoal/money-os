import { describe, it, expect } from "vitest";
import {
  byPriority,
  shortfall,
  distribute,
  assignSources,
  totalFree,
  type DistributableBucket,
} from "../distribute";

const b = (o: Partial<DistributableBucket> & { id: string }): DistributableBucket => ({
  name: o.id,
  priority: 0,
  current: 0,
  target: null,
  ...o,
});

describe("byPriority", () => {
  it("puts the lower number first", () => {
    const out = byPriority([b({ id: "c", priority: 3 }), b({ id: "a", priority: 1 })]);
    expect(out.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("breaks ties by name, so the plan is reproducible", () => {
    const out = byPriority([b({ id: "z", priority: 1 }), b({ id: "a", priority: 1 })]);
    expect(out.map((x) => x.id)).toEqual(["a", "z"]);
  });

  it("does not mutate the input", () => {
    const list = [b({ id: "c", priority: 3 }), b({ id: "a", priority: 1 })];
    const before = list.map((x) => x.id);
    byPriority(list);
    expect(list.map((x) => x.id)).toEqual(before);
  });
});

describe("shortfall", () => {
  it("is what's missing", () => {
    expect(shortfall(b({ id: "x", current: 300, target: 1000 }))).toBe(700);
  });

  it("is zero for a full goal, never negative", () => {
    expect(shortfall(b({ id: "x", current: 1200, target: 1000 }))).toBe(0);
  });

  it("is null with no target", () => {
    expect(shortfall(b({ id: "x", current: 300 }))).toBeNull();
  });
});

describe("distribute", () => {
  const goals = [
    b({ id: "emergency", name: "Emergency", priority: 1, current: 500, target: 3000 }),
    b({ id: "car", name: "Car", priority: 2, current: 0, target: 5000 }),
    b({ id: "holiday", name: "Holiday", priority: 3, current: 0, target: 1200 }),
  ];

  it("fills the most important goal first", () => {
    const d = distribute(1000, goals);
    expect(d.moves).toHaveLength(1);
    expect(d.moves[0].bucketId).toBe("emergency");
    expect(d.moves[0].amount).toBe(1000);
  });

  it("moves on once a goal is complete", () => {
    // 2 500 completes the emergency fund exactly; the rest goes to the car.
    const d = distribute(3000, goals);
    expect(d.moves.map((m) => [m.bucketId, m.amount])).toEqual([
      ["emergency", 2500],
      ["car", 500],
    ]);
    expect(d.moves[0].completes).toBe(true);
    expect(d.moves[1].completes).toBe(false);
  });

  it("respects the ranking rather than spreading evenly", () => {
    const d = distribute(2000, goals);
    // Everything to the emergency fund. Nothing to the holiday, however
    // appealing — that's what a hierarchy means.
    expect(d.moves).toHaveLength(1);
    expect(d.stillShort.find((s) => s.id === "holiday")?.missing).toBe(1200);
  });

  it("skips a goal that is already full", () => {
    const full = [
      b({ id: "done", priority: 1, current: 1000, target: 1000 }),
      b({ id: "next", priority: 2, current: 0, target: 500 }),
    ];
    const d = distribute(300, full);
    expect(d.moves[0].bucketId).toBe("next");
  });

  it("reports money with nowhere to go", () => {
    const d = distribute(20000, goals);
    // 2500 + 5000 + 1200 = 8700 fills everything.
    expect(d.distributed).toBe(8700);
    expect(d.leftOver).toBe(11300);
  });

  it("never lets a bottomless goal starve the ranked ones", () => {
    // A no-target bucket at priority 1 would swallow everything if it were fed
    // first, which is never what "this matters most" meant.
    const withBottomless = [b({ id: "spending", priority: 1, current: 0, target: null }), ...goals];
    const d = distribute(3000, withBottomless);
    expect(d.moves[0].bucketId).toBe("emergency");
    expect(d.moves.find((m) => m.bucketId === "spending")).toBeUndefined();
  });

  it("gives the remainder to a bottomless goal once the rest are full", () => {
    const withBottomless = [b({ id: "spending", priority: 9, current: 0, target: null }), ...goals];
    const d = distribute(10000, withBottomless);
    const last = d.moves[d.moves.length - 1];
    expect(last.bucketId).toBe("spending");
    expect(last.amount).toBe(1300);
    expect(d.leftOver).toBe(0);
  });

  it("plans nothing for nothing", () => {
    const d = distribute(0, goals);
    expect(d.moves).toEqual([]);
    expect(d.distributed).toBe(0);
  });

  it("refuses to invent money from a negative amount", () => {
    const d = distribute(-500, goals);
    expect(d.moves).toEqual([]);
    expect(d.leftOver).toBe(0);
  });

  it("lists what is still short after the money runs out", () => {
    const d = distribute(2500, goals);
    expect(d.stillShort.map((s) => s.id)).toEqual(["car", "holiday"]);
  });

  it("never distributes more than it was given", () => {
    for (const amount of [1, 100, 3000, 8699, 8700]) {
      expect(distribute(amount, goals).distributed).toBeLessThanOrEqual(amount);
    }
  });
});

describe("assignSources", () => {
  const moves = distribute(3000, [
    b({ id: "emergency", name: "Emergency", priority: 1, current: 500, target: 3000 }),
    b({ id: "car", name: "Car", priority: 2, current: 0, target: 5000 }),
  ]).moves;

  it("drains the fullest account first, for fewer transfers", () => {
    const { moves: out } = assignSources(moves, [
      { accountId: "small", accountName: "Small", free: 100 },
      { accountId: "big", accountName: "Big", free: 5000 },
    ]);
    expect(out.every((m) => m.accountId === "big")).toBe(true);
  });

  it("splits a move across accounts when one can't cover it", () => {
    const { moves: out } = assignSources(moves, [
      { accountId: "a", accountName: "A", free: 2000 },
      { accountId: "b", accountName: "B", free: 2000 },
    ]);
    const emergency = out.filter((m) => m.bucketId === "emergency");
    expect(emergency).toHaveLength(2);
    expect(emergency.reduce((s, m) => s + m.amount, 0)).toBe(2500);
  });

  it("reports what it could not fund", () => {
    const { unfunded } = assignSources(moves, [
      { accountId: "a", accountName: "A", free: 1000 },
    ]);
    expect(unfunded).toBe(2000);
  });

  it("ignores an account with nothing free", () => {
    // Its balance may be large, but it's already promised elsewhere.
    const { moves: out } = assignSources(moves, [
      { accountId: "empty", accountName: "Empty", free: 0 },
      { accountId: "real", accountName: "Real", free: 5000 },
    ]);
    expect(out.every((m) => m.accountId === "real")).toBe(true);
  });
});

describe("totalFree", () => {
  it("adds up what can be moved", () => {
    expect(totalFree([{ accountId: "a", accountName: "A", free: 100 }, { accountId: "b", accountName: "B", free: 250 }])).toBe(350);
  });

  it("treats an overdrawn account as nothing to give, not as a debt", () => {
    expect(totalFree([{ accountId: "a", accountName: "A", free: -100 }])).toBe(0);
  });
});
