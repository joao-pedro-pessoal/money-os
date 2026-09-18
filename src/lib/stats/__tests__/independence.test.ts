import { describe, expect, it } from "vitest";
import { independencePlan, monthsGained, type PlanInput } from "../independence";

const base: PlanInput = {
  current: 50_000,
  monthlySaving: 1_000,
  monthlySpending: 1_500,
  realReturnPercent: 4,
  withdrawalPercent: 4,
};

describe("independencePlan", () => {
  it("needs twenty-five years of spending at 4%", () => {
    const plan = independencePlan(base);
    expect(plan.target).toBe(450_000);
    expect(plan.progress).toBeCloseTo(50_000 / 450_000);
  });

  it("finds the month the path crosses the target", () => {
    const plan = independencePlan(base);
    expect(plan.months).not.toBeNull();
    // Without growth it would take (450k − 50k) / 1k = 400 months; growth makes it sooner.
    expect(plan.months!).toBeLessThan(400);
    expect(plan.months!).toBeGreaterThan(200);
    const last = plan.path.at(-1)!;
    expect(last.value).toBeGreaterThanOrEqual(450_000);
  });

  it("matches plain saving when the return is zero", () => {
    expect(independencePlan({ ...base, realReturnPercent: 0 }).months).toBe(400);
  });

  it("still finds a date beyond the chart's forty years", () => {
    // 450k − 0 at 500 a month, no growth: 900 months, 75 years.
    const plan = independencePlan({ ...base, current: 0, monthlySaving: 500, realReturnPercent: 0 });
    expect(plan.months).toBe(900);
  });

  it("is already there when the money covers the target", () => {
    expect(independencePlan({ ...base, current: 500_000 }).months).toBe(0);
  });

  it("says 'not at this pace' rather than inventing a date", () => {
    const plan = independencePlan({ ...base, monthlySaving: -100, realReturnPercent: 0 });
    expect(plan.months).toBeNull();
    expect(plan.path.length).toBe(41);
  });

  it("has no target without spending or a withdrawal rate", () => {
    expect(independencePlan({ ...base, monthlySpending: 0 }).target).toBeNull();
    expect(independencePlan({ ...base, withdrawalPercent: 0 }).months).toBeNull();
  });
});

describe("monthsGained", () => {
  it("shows that saving more or spending less brings it closer", () => {
    expect(monthsGained(base, { ...base, monthlySaving: 1_100 })!).toBeLessThan(0);
    expect(monthsGained(base, { ...base, monthlySpending: 1_400 })!).toBeLessThan(0);
  });

  it("gives nothing when either side never gets there", () => {
    expect(monthsGained({ ...base, monthlySaving: -500, realReturnPercent: 0 }, base)).toBeNull();
  });
});
