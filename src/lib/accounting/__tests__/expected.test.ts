import { describe, it, expect } from "vitest";
import {
  isArrival,
  isPending,
  nextArrival,
  isOverdue,
  pendingRows,
  arrivingWithin,
  allPendingAmounts,
  type Expected,
} from "../expected";

const TODAY = new Date("2026-09-05T12:00:00.000Z");

const item = (over: Partial<Expected> & { id: string }): Expected => ({
  name: "Something",
  amount: 100,
  currency: "EUR",
  arrival: "once",
  expectedAt: new Date("2026-09-25T00:00:00.000Z"),
  settledAt: null,
  active: true,
  ...over,
});

describe("what counts as still coming", () => {
  it("is pending while nothing has stopped it", () => {
    expect(isPending(item({ id: "a" }))).toBe(true);
  });

  /**
   * A settled one-off stays in the table as evidence that what you were owed
   * arrived — and is counted in nothing from then on.
   */
  it("stops being pending once it has arrived", () => {
    expect(isPending(item({ id: "a", settledAt: new Date() }))).toBe(false);
  });

  it("stops being pending when switched off", () => {
    expect(isPending(item({ id: "a", active: false }))).toBe(false);
  });
});

describe("when the next one lands", () => {
  it("is the date itself for a one-off", () => {
    const next = nextArrival(item({ id: "a" }), TODAY);
    expect(next?.toISOString().slice(0, 10)).toBe("2026-09-25");
  });

  /**
   * A payment due last week has not become a payment due next week. Rolling it
   * forward would hide the thing you most want to see.
   */
  it("leaves a late one-off where it was rather than rolling it", () => {
    const late = item({ id: "a", expectedAt: new Date("2026-08-20T00:00:00.000Z") });
    expect(nextArrival(late, TODAY)?.toISOString().slice(0, 10)).toBe("2026-08-20");
  });

  /**
   * Asserted on the local calendar, because `nextCharge` walks one. A monthly
   * anchor of the 25th lands on the 25th wherever you are — which in UTC is
   * the 24th at 23:00 for an hour-ahead timezone, so comparing ISO strings
   * would make this test pass or fail depending on where it ran.
   */
  it("rolls a recurring one forward from its anchor", () => {
    const salary = item({
      id: "a",
      arrival: "monthly",
      expectedAt: new Date("2026-01-25T00:00:00.000Z"),
    });
    const next = nextArrival(salary, TODAY)!;
    expect([next.getFullYear(), next.getMonth() + 1, next.getDate()]).toEqual([2026, 9, 25]);
  });

  it("keeps rolling past today rather than stopping at the anchor", () => {
    const weekly = item({
      id: "a",
      arrival: "weekly",
      expectedAt: new Date("2026-08-07T00:00:00.000Z"),
    });
    const next = nextArrival(weekly, TODAY)!;
    expect(next.getTime()).toBeGreaterThanOrEqual(
      new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()).getTime()
    );
  });

  /**
   * A debt someone owes with no agreed day still counts as coming. Nothing
   * pretends to know when.
   */
  it("has no answer when no date was given", () => {
    expect(nextArrival(item({ id: "a", expectedAt: null }), TODAY)).toBeNull();
  });
});

describe("being late", () => {
  it("is true for a one-off whose date has passed", () => {
    const late = item({ id: "a", expectedAt: new Date("2026-08-20T00:00:00.000Z") });
    expect(isOverdue(late, TODAY)).toBe(true);
  });

  /**
   * A recurring arrival is never late — it rolls to its next date. Answering
   * anything else would invite the reader to think it had been checked.
   */
  it("is never true for a recurring one", () => {
    const monthly = item({
      id: "a",
      arrival: "monthly",
      expectedAt: new Date("2026-01-25T00:00:00.000Z"),
    });
    expect(isOverdue(monthly, TODAY)).toBe(false);
  });

  it("is not true for something already settled", () => {
    const paid = item({
      id: "a",
      expectedAt: new Date("2026-08-20T00:00:00.000Z"),
      settledAt: new Date("2026-08-21T00:00:00.000Z"),
    });
    expect(isOverdue(paid, TODAY)).toBe(false);
  });

  it("is not true when there is no date to be late against", () => {
    expect(isOverdue(item({ id: "a", expectedAt: null }), TODAY)).toBe(false);
  });
});

describe("the list", () => {
  const rows = [
    item({ id: "far", expectedAt: new Date("2026-12-01T00:00:00.000Z"), amount: 50 }),
    item({ id: "soon", expectedAt: new Date("2026-09-10T00:00:00.000Z"), amount: 20 }),
    item({ id: "undated", expectedAt: null, amount: 900 }),
    item({ id: "settled", settledAt: new Date(), amount: 999 }),
  ];

  it("puts the soonest first", () => {
    expect(pendingRows(rows, TODAY).map((r) => r.id)).toEqual(["soon", "far", "undated"]);
  });

  /**
   * Last, not first. Something unscheduled is not urgent, and sorting it to the
   * top would put the vaguest thing where the eye lands — even at 900.
   */
  it("puts an undated one last however large it is", () => {
    expect(pendingRows(rows, TODAY).at(-1)?.id).toBe("undated");
  });

  it("leaves out what has already arrived", () => {
    expect(pendingRows(rows, TODAY).map((r) => r.id)).not.toContain("settled");
  });

  it("counts the days, negative when late", () => {
    const late = [item({ id: "late", expectedAt: new Date("2026-08-26T00:00:00.000Z") })];
    const [row] = pendingRows(late, TODAY);
    expect(row.inDays).toBeLessThan(0);
    expect(row.overdue).toBe(true);
  });
});

describe("what arrives within a window", () => {
  const rows = pendingRows(
    [
      item({ id: "soon", expectedAt: new Date("2026-09-10T00:00:00.000Z"), amount: 20 }),
      item({ id: "far", expectedAt: new Date("2026-12-01T00:00:00.000Z"), amount: 50 }),
      item({ id: "undated", expectedAt: null, amount: 900 }),
    ],
    TODAY
  );

  it("includes only what is dated inside it", () => {
    expect(arrivingWithin(rows, 30)).toEqual([{ amount: 20, currency: "EUR" }]);
  });

  /**
   * "Within 30 days" is a claim about timing, and something unscheduled cannot
   * support it — however much it is worth.
   */
  it("excludes the undated one from any window", () => {
    expect(arrivingWithin(rows, 3650).map((r) => r.amount)).not.toContain(900);
  });

  it("still counts the undated one as pending overall", () => {
    expect(allPendingAmounts(rows).map((r) => r.amount)).toContain(900);
  });

  /**
   * Amounts leave here in their own currencies. Summing them in this module
   * would add euros to dollars — the bug this codebase has fixed nine times —
   * so the caller converts through `sumInBase`, which also reports what it
   * could not.
   */
  it("hands back currencies rather than a total", () => {
    const mixed = pendingRows(
      [
        item({ id: "a", currency: "EUR", amount: 10, expectedAt: new Date("2026-09-06T00:00:00.000Z") }),
        item({ id: "b", currency: "USD", amount: 10, expectedAt: new Date("2026-09-07T00:00:00.000Z") }),
      ],
      TODAY
    );
    expect(arrivingWithin(mixed, 30)).toEqual([
      { amount: 10, currency: "EUR" },
      { amount: 10, currency: "USD" },
    ]);
  });
});

describe("the vocabulary", () => {
  it("accepts one-off and every cadence subscriptions knows", () => {
    for (const v of ["once", "weekly", "monthly", "quarterly", "yearly"]) {
      expect(isArrival(v), v).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isArrival("daily")).toBe(false);
    expect(isArrival("")).toBe(false);
  });
});
