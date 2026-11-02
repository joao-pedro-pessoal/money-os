import { describe, expect, it } from "vitest";
import { afterAddition, afterArrival, allPendingAmounts, arrivingWithin, dueOf, isOverdue, nextArrival, occurrenceFor, pendingRows, remainingOf, type Expected } from "../expected";

// Local dates throughout: the schedule walks the local calendar.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const midday = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

const item = (over: Partial<Expected> = {}): Expected => ({
  id: "a",
  name: "Something",
  amount: 100,
  currency: "EUR",
  arrival: "once",
  expectedAt: day(2026, 9, 25),
  settledAt: null,
  active: true,
  ...over,
});
const salary = (over: Partial<Expected> = {}) => item({ arrival: "monthly", amount: 1000, expectedAt: day(2026, 1, 25), ...over });

describe("what is still coming", () => {
  it("is the amount, plus anything added, less what has arrived", () => {
    expect(remainingOf(item())).toBe(100);
    expect(remainingOf(item({ received: 30 }))).toBe(70);
    expect(dueOf(salary({ extra: 200 }))).toBe(1200);
    expect(remainingOf(salary({ extra: 200, received: 700 }))).toBe(500);
  });

  it("never goes below zero, and keeps cents exact", () => {
    expect(remainingOf(item({ received: 130 }))).toBe(0);
    expect(remainingOf(item({ amount: 0.3, received: 0.1 }))).toBe(0.2);
  });

  it("is what the totals count, not the original amount", () => {
    const rows = pendingRows([item({ received: 30 })], day(2026, 9, 5));
    expect(rows[0].remaining).toBe(70);
    expect(allPendingAmounts(rows)).toEqual([{ amount: 70, currency: "EUR" }]);
    expect(arrivingWithin(rows, 30)).toEqual([{ amount: 70, currency: "EUR" }]);
  });
});

describe("some of a one-off arrives", () => {
  it("stays expected until all of it is in, and keeps its date", () => {
    const change = afterArrival(item(), 30, midday(2026, 9, 26));
    expect(change).toMatchObject({ received: 30, closes: false, settledAt: null });
    expect(nextArrival(item({ ...change }), day(2026, 9, 27))).toEqual(day(2026, 9, 25));
  });

  it("is settled by the arrival that completes it, on that date", () => {
    const at = midday(2026, 9, 26);
    expect(afterArrival(item({ received: 30 }), 70, at)).toMatchObject({ received: 100, closes: true, settledAt: at });
  });

  it("more than was expected closes it rather than owing a negative", () => {
    expect(afterArrival(item(), 120, midday(2026, 9, 26))).toMatchObject({ received: 120, closes: true });
  });

  it("saying the rest is not coming closes it with what came", () => {
    const at = midday(2026, 9, 26);
    expect(afterArrival(item(), 30, at, true)).toMatchObject({ received: 30, closes: true, settledAt: at });
  });
});

describe("a recurring one arrives", () => {
  it("is not cancelled: it moves on to the next date, with nothing carried over", () => {
    const change = afterArrival(salary({ extra: 200, received: 100 }), 1100, midday(2026, 10, 25));
    expect(change).toMatchObject({ received: 0, extra: 0, settledAt: null, closes: true });
    expect(change.nextAt).toEqual(day(2026, 11, 25));
    expect(nextArrival(salary({ nextAt: change.nextAt }), day(2026, 10, 26))).toEqual(day(2026, 11, 25));
  });

  /** The schedule has already rolled on by the 27th, but this is October's, not November's. */
  it("late: counts for the date it was due, and does not skip the next", () => {
    const row = salary();
    expect(occurrenceFor(row, midday(2026, 10, 27))).toEqual(day(2026, 10, 25));
    const change = afterArrival(row, 1000, midday(2026, 10, 27));
    expect(nextArrival(salary({ nextAt: change.nextAt }), day(2026, 10, 27))).toEqual(day(2026, 11, 25));
  });

  it("early: counts for the coming date, and that one is then done", () => {
    const row = salary();
    expect(occurrenceFor(row, midday(2026, 11, 20))).toEqual(day(2026, 11, 25));
    const change = afterArrival(row, 1000, midday(2026, 11, 20));
    expect(change.nextAt).toEqual(day(2026, 12, 25));
    expect(nextArrival(salary({ nextAt: change.nextAt }), day(2026, 11, 21))).toEqual(day(2026, 12, 25));
  });

  it("once the calendar passes a date set by an early arrival, the schedule leads again", () => {
    expect(nextArrival(salary({ nextAt: day(2026, 12, 25) }), day(2026, 12, 26))).toEqual(day(2027, 1, 25));
  });

  it("never lands on a date that was already closed", () => {
    expect(occurrenceFor(salary({ nextAt: day(2026, 12, 25) }), midday(2026, 11, 26))).toEqual(day(2026, 12, 25));
  });

  it("keeps the day a short month could not hold", () => {
    const row = salary({ expectedAt: day(2026, 1, 31) });
    expect(afterArrival(row, 1000, midday(2027, 1, 31)).nextAt).toEqual(day(2027, 2, 28));
    expect(afterArrival(row, 1000, midday(2027, 2, 28)).nextAt).toEqual(day(2027, 3, 31));
  });

  it("works on weekly, quarterly and yearly schedules", () => {
    expect(afterArrival(item({ arrival: "weekly", expectedAt: day(2026, 9, 4) }), 100, midday(2026, 9, 11)).nextAt).toEqual(day(2026, 9, 18));
    expect(afterArrival(item({ arrival: "quarterly", expectedAt: day(2026, 1, 15) }), 100, midday(2026, 7, 15)).nextAt).toEqual(day(2026, 10, 15));
    expect(afterArrival(item({ arrival: "yearly", expectedAt: day(2025, 3, 1) }), 100, midday(2026, 3, 1)).nextAt).toEqual(day(2027, 3, 1));
  });

  it("with no agreed day has no date to move, and starts over", () => {
    expect(afterArrival(salary({ expectedAt: null }), 1000, midday(2026, 10, 25))).toMatchObject({ received: 0, nextAt: null, closes: true });
  });
});

describe("part of a recurring one arrives", () => {
  const partial = () => afterArrival(salary(), 600, midday(2026, 10, 25));

  it("holds that date with what is left, instead of presenting it as next month's", () => {
    const change = partial();
    expect(change).toMatchObject({ received: 600, closes: false });
    const held = salary({ received: change.received, nextAt: change.nextAt });
    expect(remainingOf(held)).toBe(400);
    expect(nextArrival(held, day(2026, 10, 28))).toEqual(day(2026, 10, 25));
  });

  it("reads as late once its date has passed, which an untouched one never does", () => {
    const change = partial();
    const held = salary({ received: change.received, nextAt: change.nextAt });
    expect(isOverdue(held, day(2026, 10, 25))).toBe(false);
    expect(isOverdue(held, day(2026, 10, 28))).toBe(true);
    expect(isOverdue(salary(), day(2026, 10, 28))).toBe(false);
  });

  it("the rest arriving later still belongs to that date, then it moves on", () => {
    const change = partial();
    const held = salary({ received: change.received, nextAt: change.nextAt });
    const rest = afterArrival(held, 400, midday(2026, 11, 20));
    expect(rest).toMatchObject({ received: 0, closes: true });
    expect(rest.nextAt).toEqual(day(2026, 11, 25));
  });

  it("saying the rest is not coming moves on too", () => {
    expect(afterArrival(salary(), 600, midday(2026, 10, 25), true)).toMatchObject({ received: 0, closes: true, nextAt: day(2026, 11, 25) });
  });
});

describe("more is coming than was said", () => {
  it("makes a one-off bigger", () => {
    expect(afterAddition(item({ received: 30 }), 50, day(2026, 9, 5))).toMatchObject({ amount: 150, extra: 0 });
  });

  it("adds to a recurring one for the next date only", () => {
    const change = afterAddition(salary(), 200, day(2026, 10, 10));
    expect(change).toMatchObject({ amount: 1000, extra: 200 });
    expect(change.nextAt).toEqual(day(2026, 10, 25));
    const held = salary({ extra: change.extra, nextAt: change.nextAt });
    expect(remainingOf(held)).toBe(1200);
    expect(nextArrival(held, day(2026, 10, 28))).toEqual(day(2026, 10, 25));
  });

  it("is gone once that one has arrived", () => {
    const held = salary({ extra: 200, nextAt: day(2026, 10, 25) });
    const change = afterArrival(held, 1200, midday(2026, 10, 25));
    expect(change).toMatchObject({ extra: 0, received: 0 });
    expect(remainingOf(salary({ extra: change.extra, received: change.received, nextAt: change.nextAt }))).toBe(1000);
  });
});
