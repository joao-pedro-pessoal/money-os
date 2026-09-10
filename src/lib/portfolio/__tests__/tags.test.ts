import { describe, expect, it } from "vitest";
import {
  DIRECTIONS,
  annualIncomeLabel,
  annualYieldLabel,
  timeHorizonColor,
} from "../tags";

describe("position labels", () => {
  /**
   * This test used to demand the bare words "Long" and "Short". The labels grew
   * an explanation on purpose: "short" is the one tag on the form whose meaning
   * is backwards from the everyday word, and a dropdown is read by someone who
   * is deciding, not revising. Brevity was the wrong thing to protect here.
   */
  it("says which way each direction gains", () => {
    expect(DIRECTIONS.map((direction) => direction.value)).toEqual(["long", "short"]);
    expect(DIRECTIONS[0].label).toMatch(/^Long\b.*rises/);
    expect(DIRECTIONS[1].label).toMatch(/^Short\b.*falls/);
  });

  it("does not describe dividends as interest", () => {
    expect(annualYieldLabel("stock")).toBe("Dividend yield");
    expect(annualYieldLabel("etf")).toBe("Dividend yield");
    expect(annualIncomeLabel("stock")).toBe("Dividends received");
  });

  it("uses an income label appropriate to cash and staking", () => {
    expect(annualYieldLabel("cash")).toBe("Interest rate");
    expect(annualYieldLabel("staking")).toBe("Staking APR");
    expect(annualIncomeLabel("staking")).toBe("Rewards received");
  });

  it("hides the annual-rate field for assets without that income model", () => {
    expect(annualYieldLabel("crypto")).toBeNull();
    expect(annualYieldLabel("commodity")).toBeNull();
  });

  it("gives every horizon a distinct visual colour", () => {
    expect(new Set([timeHorizonColor("short"), timeHorizonColor("medium"), timeHorizonColor("long")]).size).toBe(3);
  });
});
