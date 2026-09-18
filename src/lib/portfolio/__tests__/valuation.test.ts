import { describe, expect, it } from "vitest";
import { ageLabel, isManuallyValued, valuationAge } from "../valuation";
import { ASSET_TYPES } from "../tags";

const now = new Date("2026-09-18T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("valuationAge", () => {
  it("is due once a hand-set value is older than its type allows", () => {
    expect(valuationAge({ assetType: "vehicle", quoteSymbol: null, lastPriceUpdate: daysAgo(200) }, now)).toEqual({
      days: 200,
      due: true,
      limit: 180,
    });
    expect(valuationAge({ assetType: "real_estate", quoteSymbol: null, lastPriceUpdate: daysAgo(200) }, now)?.due).toBe(false);
  });

  it("does not apply to market-priced, unvalued or ordinary positions", () => {
    expect(valuationAge({ assetType: "real_estate", quoteSymbol: "yahoo:O", lastPriceUpdate: daysAgo(900) }, now)).toBeNull();
    expect(valuationAge({ assetType: "art", quoteSymbol: null, lastPriceUpdate: null }, now)).toBeNull();
    expect(valuationAge({ assetType: "stock", quoteSymbol: null, lastPriceUpdate: daysAgo(900) }, now)).toBeNull();
  });

  it("covers every hand-valued type the form offers", () => {
    const offered = ASSET_TYPES.map((t) => t.value as string);
    for (const type of ["real_estate", "art", "collectible", "private_equity", "vehicle"]) {
      expect(offered).toContain(type);
      expect(isManuallyValued(type)).toBe(true);
    }
  });
});

describe("ageLabel", () => {
  it("reads as days, months and years", () => {
    expect(ageLabel(1)).toBe("1 day");
    expect(ageLabel(45)).toBe("1 month");
    expect(ageLabel(400)).toBe("1 year and 1 month");
    expect(ageLabel(730)).toBe("2 years");
  });
});
