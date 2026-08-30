import { describe, expect, it } from "vitest";
import {
  monthlyInterest,
  payoffMonths,
  describeMonths,
  totalCost,
  liabilityLabel,
} from "../liabilities";

describe("what owing costs this month", () => {
  it("works out the interest from the rate", () => {
    // 200 000 at 3.6% is 600 a month before a cent comes off the balance.
    expect(monthlyInterest(200_000, 3.6)).toBe(600);
  });

  it("says nothing when no rate was entered", () => {
    // A debt whose rate you haven't recorded is not an interest-free debt, and
    // 0,00 would say it is.
    expect(monthlyInterest(200_000, null)).toBeNull();
  });

  it("costs nothing once it is paid off", () => {
    expect(monthlyInterest(0, 5)).toBe(0);
  });
});

describe("how long until it is gone", () => {
  it("counts the months at a fixed payment", () => {
    // 10 000 at 5% paid at 500 clears in a bit under two years.
    expect(payoffMonths(10_000, 5, 500)).toBe(21);
  });

  it("divides straight through when there is no rate", () => {
    expect(payoffMonths(1_000, null, 100)).toBe(10);
  });

  it("says never when the payment only covers the interest", () => {
    // The minimum-payment trap: 5 000 at 24% accrues 100 a month, so paying
    // 100 leaves the balance exactly where it started, forever. Returning a
    // very large number would dress that up as "a long time".
    expect(payoffMonths(5_000, 24, 100)).toBeNull();
    expect(payoffMonths(5_000, 24, 90)).toBeNull();
  });

  it("clears once the payment beats the interest", () => {
    expect(payoffMonths(5_000, 24, 150)).toBeGreaterThan(0);
  });

  it("says nothing without a payment to go on", () => {
    expect(payoffMonths(5_000, 5, null)).toBeNull();
    expect(payoffMonths(5_000, 5, 0)).toBeNull();
  });

  it("has nothing to clear when nothing is owed", () => {
    expect(payoffMonths(0, 5, 200)).toBeNull();
  });
});

describe("what the debt will have cost in total", () => {
  it("names the interest on top of the balance", () => {
    // The figure that changes minds: the debt is not the balance.
    const cost = totalCost(12_000, 7, 200)!;
    expect(cost.months).toBeGreaterThan(60);
    expect(cost.totalInterest).toBeGreaterThan(2_000);
  });

  it("costs no interest when there is no rate", () => {
    expect(totalCost(1_000, null, 100)!.totalInterest).toBe(0);
  });

  it("says nothing about a debt that never clears", () => {
    expect(totalCost(5_000, 24, 100)).toBeNull();
  });
});

describe("reading months as time", () => {
  it("keeps small numbers in months and larger ones in years", () => {
    expect(describeMonths(1)).toBe("1 month");
    expect(describeMonths(11)).toBe("11 months");
    expect(describeMonths(12)).toBe("1 year");
    expect(describeMonths(38)).toBe("3 years, 2 months");
  });

  it("says never rather than showing an enormous number", () => {
    expect(describeMonths(null)).toBe("never at this payment");
  });
});

describe("naming a kind", () => {
  it("uses the label people recognise", () => {
    expect(liabilityLabel("credit_card")).toBe("Credit card");
  });

  it("falls back to whatever was stored rather than dropping it", () => {
    expect(liabilityLabel("something_new")).toBe("something_new");
  });
});
