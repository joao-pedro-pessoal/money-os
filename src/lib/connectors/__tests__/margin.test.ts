import { describe, it, expect } from "vitest";
import { marginView, pressureOf, describePressure } from "../margin";

describe("marginView", () => {
  it("trusts what the platform reports over anything derived", () => {
    // The venue knows about maintenance margin and pending orders; a
    // subtraction here would not.
    const v = marginView({ equity: 123.67, marginUsed: 60, withdrawable: 24.91 });
    expect(v.available).toBe(24.91);
    expect(v.reported).toBe(true);
  });

  it("falls back to equity minus margin, and says it did", () => {
    const v = marginView({ equity: 100, marginUsed: 30, withdrawable: null });
    expect(v.available).toBe(70);
    expect(v.reported).toBe(false);
  });

  it("never reports negative availability", () => {
    // An account underwater has nothing free; it does not have minus €40 free.
    expect(marginView({ equity: 100, marginUsed: 140, withdrawable: null }).available).toBe(0);
    expect(marginView({ equity: 100, marginUsed: 0, withdrawable: -5 }).available).toBe(0);
  });

  it("treats missing margin as none used", () => {
    const v = marginView({ equity: 100, marginUsed: null, withdrawable: null });
    expect(v.marginUsed).toBe(0);
    expect(v.available).toBe(100);
  });

  it("works out how much of the account is locked", () => {
    expect(marginView({ equity: 200, marginUsed: 50, withdrawable: null }).usedPercent).toBe(25);
  });

  it("does not divide by zero on an empty account", () => {
    expect(marginView({ equity: 0, marginUsed: 0, withdrawable: null }).usedPercent).toBeNull();
  });

  it("reproduces the account from the screenshot", () => {
    // 123.67 equity with two open shorts, of which only 24.91 is actually free.
    // Showing the equity as available would overstate it fivefold.
    const v = marginView({ equity: 123.67, marginUsed: 98.76, withdrawable: 24.91 });
    expect(v.available).toBeLessThan(v.equity);
    expect(v.usedPercent).toBeCloseTo(79.86, 1);
  });
});

describe("pressureOf", () => {
  it("is comfortable when little is locked", () => {
    expect(pressureOf(marginView({ equity: 100, marginUsed: 10, withdrawable: null }))).toBe(
      "comfortable"
    );
  });

  it("is tight past half", () => {
    expect(pressureOf(marginView({ equity: 100, marginUsed: 55, withdrawable: null }))).toBe("tight");
  });

  it("is stretched past four fifths", () => {
    expect(pressureOf(marginView({ equity: 100, marginUsed: 85, withdrawable: null }))).toBe(
      "stretched"
    );
  });

  it("says nothing about an empty account", () => {
    expect(pressureOf(marginView({ equity: 0, marginUsed: 0, withdrawable: null }))).toBe(
      "comfortable"
    );
  });
});

describe("describePressure", () => {
  it("stays silent when there's nothing to say", () => {
    expect(describePressure(marginView({ equity: 100, marginUsed: 5, withdrawable: null }))).toBe("");
  });

  it("warns without claiming to predict a liquidation", () => {
    // That depends on each position's maintenance margin and mark price, which
    // this doesn't know — promising it would be a lie with consequences.
    const text = describePressure(marginView({ equity: 100, marginUsed: 90, withdrawable: null }));
    expect(text).not.toContain("liquidat");
    expect(text.length).toBeGreaterThan(0);
  });
});
