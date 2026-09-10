import { describe, it, expect } from "vitest";
import {
  periodBounds,
  shiftPeriod,
  statusFor,
  envelopeState,
  carriedInto,
  periodProgress,
  isPacingOver,
  monthlyEquivalent,
  isPeriod,
  type Envelope,
  type Spend,
} from "../envelopes";

const envelope = (o: Partial<Envelope> = {}): Envelope => ({
  id: "e1",
  name: "Going out",
  period: "monthly",
  limit: 400,
  anchor: new Date(2026, 0, 1),
  rollover: false,
  categoryIds: ["food"],
  ...o,
});

describe("periodBounds", () => {
  it("finds the monthly period containing today", () => {
    const b = periodBounds("monthly", new Date(2026, 0, 1), new Date(2026, 7, 14));
    expect(b.start.getMonth()).toBe(7);
    expect(b.end.getMonth()).toBe(8);
  });

  it("runs from the anchor day, not the 1st", () => {
    // A budget anchored on the 15th runs 15th to 15th. Snapping it to the
    // calendar month would quietly change what it measures.
    const b = periodBounds("monthly", new Date(2026, 0, 15), new Date(2026, 7, 20));
    expect(b.start.getDate()).toBe(15);
    expect(b.start.getMonth()).toBe(7);
  });

  it("keeps you in the previous period before the anchor day arrives", () => {
    const b = periodBounds("monthly", new Date(2026, 0, 15), new Date(2026, 7, 10));
    expect(b.start.getMonth()).toBe(6);
    expect(b.start.getDate()).toBe(15);
  });

  it("runs a weekly budget from its own weekday", () => {
    // Anchored on a Wednesday, it must not jump to Monday.
    const anchor = new Date(2026, 0, 7);
    const b = periodBounds("weekly", anchor, new Date(2026, 0, 20));
    expect(b.start.getDay()).toBe(anchor.getDay());
    expect((b.end.getTime() - b.start.getTime()) / 86_400_000).toBe(7);
  });

  it("handles quarterly and yearly", () => {
    const q = periodBounds("quarterly", new Date(2026, 0, 1), new Date(2026, 7, 14));
    expect(q.start.getMonth()).toBe(6); // Jul–Sep
    const y = periodBounds("yearly", new Date(2026, 0, 1), new Date(2026, 7, 14));
    expect(y.start.getFullYear()).toBe(2026);
    expect(y.end.getFullYear()).toBe(2027);
  });

  it("clamps a 31st anchor into shorter months", () => {
    const b = periodBounds("monthly", new Date(2026, 0, 31), new Date(2026, 1, 28));
    expect(b.start.getMonth()).toBe(1);
    expect(b.start.getDate()).toBe(28);
  });

  it("always returns a period that actually contains today", () => {
    // The property that matters. Comparing day-of-month directly satisfied
    // every example above and still put 28 February inside a period ending on
    // 28 February.
    const anchors = [1, 15, 28, 29, 30, 31];
    const days = [1, 14, 28, 29, 30, 31];
    for (const anchorDay of anchors) {
      for (const month of [0, 1, 2, 7, 11]) {
        for (const day of days) {
          const today = new Date(2026, month, day);
          if (today.getMonth() !== month) continue; // skip 31 Feb and friends
          const b = periodBounds("monthly", new Date(2026, 0, anchorDay), today);
          const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          expect(b.start.getTime()).toBeLessThanOrEqual(t.getTime());
          expect(b.end.getTime()).toBeGreaterThan(t.getTime());
        }
      }
    }
  });

  it("recognises valid periods only", () => {
    expect(isPeriod("weekly")).toBe(true);
    expect(isPeriod("fortnightly")).toBe(false);
  });
});

describe("shiftPeriod", () => {
  it("steps back and forward symmetrically", () => {
    const b = periodBounds("monthly", new Date(2026, 0, 1), new Date(2026, 7, 14));
    const roundTrip = shiftPeriod("monthly", shiftPeriod("monthly", b, -3), 3);
    expect(roundTrip.start.getTime()).toBe(b.start.getTime());
  });

  it("steps a week by seven days", () => {
    const b = periodBounds("weekly", new Date(2026, 0, 7), new Date(2026, 0, 7));
    const prev = shiftPeriod("weekly", b, -1);
    expect((b.start.getTime() - prev.start.getTime()) / 86_400_000).toBe(7);
  });
});

describe("statusFor", () => {
  it("flags overspend", () => {
    expect(statusFor(101, 100)).toBe("over");
  });

  it("warns before the limit is breached", () => {
    expect(statusFor(90, 100)).toBe("close");
    expect(statusFor(89, 100)).toBe("under");
  });

  it("treats spending exactly the limit as done, not failed", () => {
    expect(statusFor(100, 100)).toBe("close");
  });

  it("calls spending against nothing an overspend", () => {
    // Available can be zero or less once a carried overspend is counted.
    expect(statusFor(50, 0)).toBe("over");
    expect(statusFor(0, 0)).toBe("none");
  });
});

describe("envelopeState", () => {
  const today = new Date(2026, 7, 14);
  const spending: Spend[] = [
    { date: new Date(2026, 7, 3), amount: -120, categoryId: "food" },
    { date: new Date(2026, 7, 9), amount: -80, categoryId: "food" },
    { date: new Date(2026, 7, 10), amount: -500, categoryId: "rent" },
    { date: new Date(2026, 6, 20), amount: -300, categoryId: "food" },
  ];

  it("counts only its own categories, in its own period", () => {
    const s = envelopeState(envelope(), spending, today);
    expect(s.spent).toBe(200);
  });

  it("covers several categories at once", () => {
    const s = envelopeState(envelope({ categoryIds: ["food", "rent"] }), spending, today);
    expect(s.spent).toBe(700);
  });

  it("reports a negative remaining rather than clamping", () => {
    const s = envelopeState(envelope({ limit: 150 }), spending, today);
    expect(s.remaining).toBe(-50);
    expect(s.status).toBe("over");
  });

  it("ignores uncategorised spending", () => {
    const s = envelopeState(
      envelope(),
      [...spending, { date: new Date(2026, 7, 5), amount: -900, categoryId: null }],
      today
    );
    expect(s.spent).toBe(200);
  });
});

describe("carriedInto", () => {
  const today = new Date(2026, 7, 14);

  it("is nothing when rollover is off", () => {
    const bounds = periodBounds("monthly", new Date(2026, 0, 1), today);
    expect(carriedInto(envelope({ rollover: false }), [], bounds)).toBe(0);
  });

  it("carries unspent budget forward", () => {
    // Anchored 1 July, so exactly one completed period with nothing spent.
    const e = envelope({ rollover: true, anchor: new Date(2026, 6, 1), limit: 400 });
    const bounds = periodBounds("monthly", e.anchor, today);
    expect(carriedInto(e, [], bounds)).toBe(400);
  });

  it("carries an overspend as a negative", () => {
    // Blowing through last month and starting fresh is what makes envelope
    // budgeting pointless.
    const e = envelope({ rollover: true, anchor: new Date(2026, 6, 1), limit: 100 });
    const bounds = periodBounds("monthly", e.anchor, today);
    const spentLastMonth: Spend[] = [
      { date: new Date(2026, 6, 15), amount: -300, categoryId: "food" },
    ];
    expect(carriedInto(e, spentLastMonth, bounds)).toBe(-200);
  });

  it("never counts periods from before the budget existed", () => {
    const e = envelope({ rollover: true, anchor: new Date(2026, 7, 1), limit: 400 });
    const bounds = periodBounds("monthly", e.anchor, today);
    expect(carriedInto(e, [], bounds)).toBe(0);
  });

  it("stops after the lookback so an old budget stays meaningful", () => {
    // Unbounded carry turns a year-old budget into "you have 4 800 for food",
    // which is arithmetically true and useless as guidance.
    const e = envelope({ rollover: true, anchor: new Date(2020, 0, 1), limit: 400 });
    const bounds = periodBounds("monthly", e.anchor, today);
    expect(carriedInto(e, [], bounds)).toBe(400 * 12);
  });

  it("adds the carry to what's available", () => {
    const e = envelope({ rollover: true, anchor: new Date(2026, 6, 1), limit: 400 });
    const s = envelopeState(e, [], today);
    expect(s.carried).toBe(400);
    expect(s.available).toBe(800);
  });
});

describe("periodProgress", () => {
  it("is 0 at the start and 1 at the end", () => {
    const b = periodBounds("monthly", new Date(2026, 7, 1), new Date(2026, 7, 14));
    expect(periodProgress(b, b.start)).toBe(0);
    expect(periodProgress(b, b.end)).toBe(1);
  });

  it("is about half way through the middle", () => {
    const b = periodBounds("monthly", new Date(2026, 7, 1), new Date(2026, 7, 16));
    const p = periodProgress(b, new Date(2026, 7, 16));
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });
});

describe("isPacingOver", () => {
  const state = { available: 100, spent: 80 } as never as Parameters<typeof isPacingOver>[0];

  it("flags spending ahead of the calendar", () => {
    expect(isPacingOver(state, 0.4)).toBe(true);
  });

  it("is quiet at the very start and the very end", () => {
    // On day one a coffee is "1000% of pace" — true and useless. On the last
    // day it's too late to act.
    expect(isPacingOver(state, 0.01)).toBe(false);
    expect(isPacingOver(state, 0.99)).toBe(false);
  });
});

describe("monthlyEquivalent", () => {
  it("normalises any period so budgets can be compared", () => {
    expect(monthlyEquivalent(400, "monthly")).toBe(400);
    expect(monthlyEquivalent(4800, "yearly")).toBe(400);
    expect(monthlyEquivalent(1200, "quarterly")).toBe(400);
  });

  it("uses 52 weeks, not 48", () => {
    // "×4 a month" understates a weekly budget by a month's worth a year.
    expect(monthlyEquivalent(100, "weekly")).toBe(433.33);
  });
});
