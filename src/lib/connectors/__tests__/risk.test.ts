import { describe, it, expect } from "vitest";
import { capitalAtRisk } from "../margin";

describe("capitalAtRisk", () => {
  it("prefers the margin the platform reported", () => {
    // It accounts for the venue's initial-margin rules; a division wouldn't.
    const r = capitalAtRisk({ positionValue: 258, marginUsed: 51.6, leverage: 5 });
    expect(r.atRisk).toBe(51.6);
    expect(r.notional).toBe(258);
    expect(r.reported).toBe(true);
  });

  it("divides by leverage when no margin was reported", () => {
    const r = capitalAtRisk({ positionValue: 258, marginUsed: null, leverage: 5 });
    expect(r.atRisk).toBe(51.6);
    expect(r.reported).toBe(false);
  });

  it("risks the whole value when there is no leverage", () => {
    // A cash equity position can lose everything, and nothing more.
    const r = capitalAtRisk({ positionValue: 100, marginUsed: null, leverage: null });
    expect(r.atRisk).toBe(100);
    expect(r.notional).toBe(100);
  });

  it("treats 1× as no leverage", () => {
    expect(capitalAtRisk({ positionValue: 100, marginUsed: null, leverage: 1 }).atRisk).toBe(100);
  });

  it("uses the absolute value, so a short isn't negative", () => {
    const r = capitalAtRisk({ positionValue: -258, marginUsed: -51.6, leverage: 5 });
    expect(r.atRisk).toBe(51.6);
    expect(r.notional).toBe(258);
  });

  it("is zero for a position with no value", () => {
    const r = capitalAtRisk({ positionValue: null, marginUsed: null, leverage: null });
    expect(r.atRisk).toBe(0);
    expect(r.notional).toBe(0);
  });

  it("never divides by zero on a nonsense leverage", () => {
    const r = capitalAtRisk({ positionValue: 100, marginUsed: null, leverage: 0 });
    expect(r.atRisk).toBe(100);
    expect(Number.isFinite(r.atRisk)).toBe(true);
  });

  it("reproduces the silver short from the screenshot", () => {
    // €257.89 of exposure listed as the position's value made the portfolio
    // look five times bigger than the capital actually committed to it.
    const r = capitalAtRisk({ positionValue: 257.89, marginUsed: null, leverage: 5 });
    expect(r.atRisk).toBeCloseTo(51.58, 2);
    expect(r.notional).toBe(257.89);
    expect(r.atRisk).toBeLessThan(r.notional);
  });
});
