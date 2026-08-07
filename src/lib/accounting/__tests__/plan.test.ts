import { describe, it, expect } from "vitest";
import { buildPlan, goalProgress, type PlannedBucket } from "../plan";

function b(over: Partial<PlannedBucket> = {}): PlannedBucket {
  return { id: "1", name: "B", targetPercent: null, current: 0, targetAmount: null, ...over };
}

describe("buildPlan", () => {
  it("works out the target amount from each percentage", () => {
    const plan = buildPlan(
      [
        b({ id: "a", name: "Emergency", targetPercent: 25, current: 0 }),
        b({ id: "b", name: "Travel", targetPercent: 30, current: 0 }),
      ],
      1000
    );
    expect(plan.rows[0].target).toBe(250);
    expect(plan.rows[1].target).toBe(300);
  });

  it("reports drift in both directions", () => {
    const plan = buildPlan(
      [
        b({ id: "a", targetPercent: 50, current: 200 }), // needs 500 -> +300
        b({ id: "b", targetPercent: 50, current: 800 }), // needs 500 -> -300
      ],
      1000
    );
    expect(plan.rows[0].drift).toBe(300);
    expect(plan.rows[1].drift).toBe(-300);
  });

  it("leaves the undeclared share free instead of inflating buckets to 100%", () => {
    const plan = buildPlan(
      [b({ id: "a", targetPercent: 25 }), b({ id: "b", targetPercent: 30 })],
      1000
    );
    expect(plan.totalPercent).toBe(55);
    expect(plan.unplannedPercent).toBe(45);
    expect(plan.unplannedAmount).toBe(450);
    expect(plan.overcommitted).toBe(false);
  });

  it("flags percentages over 100 rather than scaling them down", () => {
    const plan = buildPlan(
      [b({ id: "a", targetPercent: 70 }), b({ id: "b", targetPercent: 50 })],
      1000
    );
    expect(plan.overcommitted).toBe(true);
    expect(plan.totalPercent).toBe(120);
    expect(plan.rows[0].target).toBe(700); // not rescaled
    expect(plan.unplannedAmount).toBe(0);
  });

  it("leaves a bucket with no percentage exactly where it is", () => {
    const plan = buildPlan([b({ id: "a", targetPercent: null, current: 123 })], 1000);
    expect(plan.rows[0].target).toBe(123);
    expect(plan.rows[0].drift).toBe(0);
  });

  it("reports the share each bucket actually holds", () => {
    const plan = buildPlan(
      [b({ id: "a", current: 750 }), b({ id: "b", current: 250 })],
      1000
    );
    expect(plan.rows[0].actualPercent).toBe(75);
    expect(plan.rows[1].actualPercent).toBe(25);
  });

  it("marks a bucket that reached its absolute goal", () => {
    const plan = buildPlan(
      [
        b({ id: "a", current: 500, targetAmount: 500 }),
        b({ id: "b", current: 499, targetAmount: 500 }),
        b({ id: "c", current: 600, targetAmount: 500 }),
      ],
      1000
    );
    expect(plan.rows[0].goalReached).toBe(true);
    expect(plan.rows[1].goalReached).toBe(false);
    expect(plan.rows[2].goalReached).toBe(true); // over the goal still counts
  });

  it("handles having no money without dividing by zero", () => {
    const plan = buildPlan([b({ id: "a", targetPercent: 50, current: 0 })], 0);
    expect(plan.rows[0].target).toBe(0);
    expect(plan.rows[0].actualPercent).toBe(0);
  });

  it("handles an empty bucket list", () => {
    const plan = buildPlan([], 1000);
    expect(plan.rows).toEqual([]);
    expect(plan.unplannedAmount).toBe(1000);
  });
});

describe("goalProgress", () => {
  it("returns a percentage of the goal", () => {
    expect(goalProgress(250, 1000)).toBe(25);
  });

  it("caps at 100 when the goal is exceeded", () => {
    expect(goalProgress(1500, 1000)).toBe(100);
  });

  it("returns null when there is no goal", () => {
    expect(goalProgress(100, null)).toBeNull();
    expect(goalProgress(100, 0)).toBeNull();
  });
});
