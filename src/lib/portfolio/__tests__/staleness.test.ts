import { describe, it, expect } from "vitest";
import {
  assessStaleness,
  nextExportDue,
  trustLabel,
  daysBetween,
  FRESH_QUANTITY_DAYS,
  STALE_QUANTITY_DAYS,
  FRESH_PRICE_DAYS,
} from "../staleness";

const NOW = new Date("2026-08-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("how current a reconstruction is", () => {
  it("trusts a statement from within the last month", () => {
    const v = assessStaleness({ lastEventDate: daysAgo(9), priceAsOf: NOW, asOf: NOW });

    expect(v.trust).toBe("current");
    expect(v.canValue).toBe(true);
    expect(v.quantityAgeDays).toBe(9);
  });

  it("nudges once a monthly contributor would have contributed again", () => {
    const v = assessStaleness({ lastEventDate: daysAgo(50), priceAsOf: NOW, asOf: NOW });

    expect(v.trust).toBe("aging");
    // Still valued — old is not the same as wrong, and refusing to show a
    // number would be its own kind of unhelpful.
    expect(v.canValue).toBe(true);
  });

  it("stops vouching for quantities after a quarter", () => {
    const v = assessStaleness({ lastEventDate: daysAgo(120), priceAsOf: NOW, asOf: NOW });

    expect(v.trust).toBe("stale");
    expect(v.headline).toMatch(/not what you hold/i);
  });

  it("puts the boundaries exactly where the constants say", () => {
    // Off-by-one on a threshold is invisible in production and permanent.
    expect(
      assessStaleness({ lastEventDate: daysAgo(FRESH_QUANTITY_DAYS), priceAsOf: NOW, asOf: NOW })
        .trust
    ).toBe("current");
    expect(
      assessStaleness({
        lastEventDate: daysAgo(FRESH_QUANTITY_DAYS + 1),
        priceAsOf: NOW,
        asOf: NOW,
      }).trust
    ).toBe("aging");
    expect(
      assessStaleness({ lastEventDate: daysAgo(STALE_QUANTITY_DAYS), priceAsOf: NOW, asOf: NOW })
        .trust
    ).toBe("aging");
    expect(
      assessStaleness({
        lastEventDate: daysAgo(STALE_QUANTITY_DAYS + 1),
        priceAsOf: NOW,
        asOf: NOW,
      }).trust
    ).toBe("stale");
  });

  it("has nothing to say before the first import", () => {
    const v = assessStaleness({ lastEventDate: null, priceAsOf: NOW, asOf: NOW });

    expect(v.trust).toBe("unknown");
    expect(v.canValue).toBe(false);
    expect(v.warnings[0]).toMatch(/import/i);
  });
});

describe("cash movement as the tell that a statement is out of date", () => {
  it("distrusts a recent statement once money has moved since", () => {
    // This is the entire reason to connect an open-banking cash feed to a
    // broker whose positions it can't see: the cash tells you a purchase
    // happened, which is the one thing the statement can never tell you about
    // itself.
    const v = assessStaleness({
      lastEventDate: daysAgo(3),
      priceAsOf: NOW,
      asOf: NOW,
      cashActivityAfter: daysAgo(1),
    });

    expect(v.trust).toBe("stale");
    expect(v.warnings.join(" ")).toMatch(/may have been bought/i);
  });

  it("ignores cash movement that predates the statement", () => {
    // Money moving *before* the last row is money the statement already
    // accounts for. Treating it as news would cry wolf on every import.
    const v = assessStaleness({
      lastEventDate: daysAgo(3),
      priceAsOf: NOW,
      asOf: NOW,
      cashActivityAfter: daysAgo(20),
    });

    expect(v.trust).toBe("current");
  });
});

describe("stale prices", () => {
  it("downgrades a current reconstruction when the prices are old", () => {
    const v = assessStaleness({
      lastEventDate: daysAgo(2),
      priceAsOf: daysAgo(FRESH_PRICE_DAYS + 1),
      asOf: NOW,
    });

    expect(v.trust).toBe("aging");
    expect(v.warnings.join(" ")).toMatch(/prices are/i);
  });

  it("never lets a price complaint mask wrong quantities", () => {
    // Both faults at once must report the worse one. A "prices are old" badge
    // over quantities that are months out of date would be reassuring and
    // wrong.
    const v = assessStaleness({
      lastEventDate: daysAgo(200),
      priceAsOf: daysAgo(30),
      asOf: NOW,
    });

    expect(v.trust).toBe("stale");
  });

  it("falls back to cost when there is no price at all", () => {
    const v = assessStaleness({ lastEventDate: daysAgo(2), priceAsOf: null, asOf: NOW });

    expect(v.canValue).toBe(false);
    expect(v.headline).toMatch(/what you paid/i);
  });
});

describe("the next export", () => {
  it("comes due a cadence after the last transaction", () => {
    const due = nextExportDue(daysAgo(10), NOW, 30);

    expect(due?.overdue).toBe(false);
    expect(due?.daysUntil).toBe(20);
  });

  it("is overdue once the cadence has passed", () => {
    expect(nextExportDue(daysAgo(45), NOW, 30)?.overdue).toBe(true);
  });

  it("has no opinion before the first statement", () => {
    expect(nextExportDue(null, NOW)).toBeNull();
  });
});

describe("small mercies", () => {
  it("counts days without tripping over the clock going backwards", () => {
    expect(daysBetween(NOW, daysAgo(3))).toBe(-3);
    // A future-dated row shouldn't produce a negative age on screen.
    expect(
      assessStaleness({ lastEventDate: daysAgo(-5), priceAsOf: NOW, asOf: NOW }).quantityAgeDays
    ).toBe(0);
  });

  it("gives every verdict a label and a tone", () => {
    for (const trust of ["current", "aging", "stale", "unknown"] as const) {
      const { label, tone } = trustLabel(trust);
      expect(label).not.toBe("");
      expect(["good", "warn", "bad"]).toContain(tone);
    }
  });
});
