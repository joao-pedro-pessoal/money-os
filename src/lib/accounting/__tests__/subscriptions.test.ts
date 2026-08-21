import { describe, it, expect } from "vitest";
import {
  yearlyCost,
  monthlyCost,
  totals,
  nextCharge,
  daysUntil,
  byAnnualCost,
  isCadence,
  type Subscription,
  type Cadence,
} from "../subscriptions";

const sub = (o: Partial<Subscription> & { id: string }): Subscription => ({
  name: o.id,
  amount: 10,
  currency: "EUR",
  cadence: "monthly",
  active: true,
  nextChargeAt: null,
  accountId: null,
  categoryId: null,
  ...o,
});

const identity = (amount: number, currency: string) => (currency === "EUR" ? amount : null);

describe("cost normalisation", () => {
  it.each<[Cadence, number, number]>([
    ["monthly", 10, 120],
    ["yearly", 120, 120],
    ["quarterly", 30, 120],
    ["weekly", 10, 520],
  ])("converts %s to a yearly figure", (cadence, amount, expected) => {
    expect(yearlyCost({ amount, cadence })).toBe(expected);
  });

  it("treats weekly as 52 payments, not 48", () => {
    // "×4 a month" understates a weekly charge by a month's worth each year.
    expect(yearlyCost({ amount: 10, cadence: "weekly" })).toBe(520);
    expect(yearlyCost({ amount: 10, cadence: "weekly" })).not.toBe(480);
  });

  it("spreads a yearly bill across the months", () => {
    expect(monthlyCost({ amount: 120, cadence: "yearly" })).toBe(10);
  });

  it("rounds to the cent", () => {
    expect(monthlyCost({ amount: 99.99, cadence: "yearly" })).toBe(8.33);
  });

  it("recognises valid cadences only", () => {
    expect(isCadence("monthly")).toBe(true);
    expect(isCadence("fortnightly")).toBe(false);
  });
});

describe("totals", () => {
  it("counts only active subscriptions", () => {
    const t = totals(
      [sub({ id: "a", amount: 10 }), sub({ id: "b", amount: 25, active: false })],
      identity
    );
    expect(t.monthly).toBe(10);
    expect(t.activeCount).toBe(1);
    expect(t.inactiveCount).toBe(1);
  });

  it("reproduces the ten-subscription example", () => {
    // Nine active at 8+10+20+22+15+25+20+25+35 = 180/month, one inactive.
    const amounts = [8, 10, 20, 22, 15, 25, 20, 25, 35];
    const subs = amounts.map((a, i) => sub({ id: `s${i}`, amount: a }));
    subs.push(sub({ id: "cancelled", amount: 10, active: false }));

    const t = totals(subs, identity);
    expect(t.monthly).toBe(180);
    expect(t.yearly).toBe(2160);
    expect(t.activeCount).toBe(9);
  });

  it("excludes and names currencies it cannot convert", () => {
    const t = totals([sub({ id: "a", amount: 10 }), sub({ id: "b", amount: 50, currency: "USD" })], identity);
    // The 50 USD is left out rather than counted as 50 EUR.
    expect(t.monthly).toBe(10);
    expect(t.unconverted).toEqual(["USD"]);
  });

  it("is zero, not NaN, with no subscriptions", () => {
    const t = totals([], identity);
    expect(t.monthly).toBe(0);
    expect(t.yearly).toBe(0);
    expect(t.unconverted).toEqual([]);
  });

  it("mixes cadences correctly", () => {
    const t = totals(
      [
        sub({ id: "m", amount: 10, cadence: "monthly" }),
        sub({ id: "y", amount: 120, cadence: "yearly" }),
      ],
      identity
    );
    expect(t.monthly).toBe(20);
  });
});

describe("nextCharge", () => {
  const today = new Date(2026, 7, 14); // 14 Aug 2026

  it("returns null without an anchor", () => {
    expect(nextCharge(null, "monthly", today)).toBeNull();
  });

  it("leaves a future date alone", () => {
    const future = new Date(2026, 8, 3);
    expect(nextCharge(future, "monthly", today)?.toDateString()).toBe(future.toDateString());
  });

  it("rolls a stale anchor forward to the next occurrence", () => {
    // Anchored on the 3rd of March; today is 14 August, so the 3rd of August
    // has already gone and the answer is 3 September.
    const next = nextCharge(new Date(2026, 2, 3), "monthly", today);
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(8);
    expect(next?.getDate()).toBe(3);
  });

  it("does not return a date already gone by", () => {
    const next = nextCharge(new Date(2026, 2, 3), "monthly", today);
    expect(next!.getTime()).toBeGreaterThanOrEqual(new Date(2026, 7, 14).getTime());
  });

  it("counts a charge due today as today", () => {
    const next = nextCharge(new Date(2026, 0, 14), "monthly", today);
    expect(next?.getDate()).toBe(14);
    expect(next?.getMonth()).toBe(7);
  });

  it("clamps the 31st into shorter months instead of spilling over", () => {
    // 31 Jan + 1 month must be 28 Feb, not 3 March.
    const next = nextCharge(new Date(2026, 0, 31), "monthly", new Date(2026, 1, 1));
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(28);
  });

  it("steps weekly by seven days", () => {
    const next = nextCharge(new Date(2026, 7, 1), "weekly", today);
    expect(next?.getDate()).toBe(15);
  });

  it("steps quarterly by three months", () => {
    // 10 May → 10 Aug, which is already behind us on the 14th → 10 Nov.
    const next = nextCharge(new Date(2026, 4, 10), "quarterly", today);
    expect(next?.getMonth()).toBe(10);
    expect(next?.getDate()).toBe(10);
  });

  it("keeps the day of the month across quarterly steps", () => {
    const next = nextCharge(new Date(2026, 4, 20), "quarterly", today);
    expect(next?.getMonth()).toBe(7); // 20 Aug is still ahead
    expect(next?.getDate()).toBe(20);
  });

  it("terminates on a very old anchor", () => {
    const next = nextCharge(new Date(1999, 0, 1), "monthly", today);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThanOrEqual(new Date(2026, 7, 14).getTime());
  });
});

describe("daysUntil", () => {
  const today = new Date(2026, 7, 14);

  it("is zero for today", () => {
    expect(daysUntil(new Date(2026, 7, 14), today)).toBe(0);
  });

  it("counts whole days regardless of the clock", () => {
    expect(daysUntil(new Date(2026, 7, 20, 23, 59), new Date(2026, 7, 14, 0, 1))).toBe(6);
  });

  it("survives a daylight-saving boundary", () => {
    // Late October in Europe: a naive millisecond division gives 30.96 days.
    expect(daysUntil(new Date(2026, 10, 1), new Date(2026, 9, 1))).toBe(31);
  });

  it("is null with no date", () => {
    expect(daysUntil(null, today)).toBeNull();
  });
});

describe("byAnnualCost", () => {
  it("ranks by yearly cost, not the charge amount", () => {
    const sorted = byAnnualCost([
      sub({ id: "yearly99", amount: 99, cadence: "yearly" }), // 99/yr
      sub({ id: "monthly25", amount: 25, cadence: "monthly" }), // 300/yr
    ]);
    expect(sorted[0].id).toBe("monthly25");
  });

  it("pushes cancelled ones to the bottom however expensive", () => {
    const sorted = byAnnualCost([
      sub({ id: "dead", amount: 500, active: false }),
      sub({ id: "live", amount: 5 }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["live", "dead"]);
  });

  it("does not mutate the input", () => {
    const list = [sub({ id: "a", amount: 1 }), sub({ id: "b", amount: 2 })];
    const before = list.map((s) => s.id);
    byAnnualCost(list);
    expect(list.map((s) => s.id)).toEqual(before);
  });
});
