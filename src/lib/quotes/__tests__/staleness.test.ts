import { describe, it, expect } from "vitest";
import {
  needsRepricing,
  oldestPriceAgeMinutes,
  REPRICE_AFTER_MINUTES,
  type Priceable,
} from "../staleness";

const NOW = new Date("2026-09-05T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const held = (over: Partial<Priceable> = {}): Priceable => ({
  lastPriceUpdate: minutesAgo(5),
  quoteSymbol: "yahoo:SXR8.DE",
  ...over,
});

describe("which prices are worth asking for again", () => {
  it("leaves a fresh one alone", () => {
    expect(needsRepricing(held({ lastPriceUpdate: minutesAgo(5) }), NOW)).toBe(false);
  });

  it("asks once the window has passed", () => {
    expect(needsRepricing(held({ lastPriceUpdate: minutesAgo(61) }), NOW)).toBe(true);
  });

  it("treats the window itself as due, not as still fresh", () => {
    expect(needsRepricing(held({ lastPriceUpdate: minutesAgo(REPRICE_AFTER_MINUTES) }), NOW)).toBe(
      true
    );
  });

  /**
   * Never asked is not the same as asked recently. Starting the clock at "now"
   * would leave a holding created at noon unpriced until one.
   */
  it("always asks about one nothing has ever priced", () => {
    expect(needsRepricing(held({ lastPriceUpdate: null }), NOW)).toBe(true);
  });

  /**
   * Nothing to ask, and nobody to ask. Its price is whatever was typed by
   * hand, and overwriting that would replace a stated fact with an absence.
   */
  it("never asks about one with no source", () => {
    expect(needsRepricing(held({ quoteSymbol: null }), NOW)).toBe(false);
    expect(needsRepricing(held({ quoteSymbol: null, lastPriceUpdate: null }), NOW)).toBe(false);
  });

  it("honours a window given to it", () => {
    const h = held({ lastPriceUpdate: minutesAgo(30) });
    expect(needsRepricing(h, NOW, 60)).toBe(false);
    expect(needsRepricing(h, NOW, 15)).toBe(true);
  });
});

describe("how stale the worst one is", () => {
  /** The sentence that found the bug: "11 prices, oldest 15 days". */
  it("reports the oldest, in minutes", () => {
    const rows = [held({ lastPriceUpdate: minutesAgo(10) }), held({ lastPriceUpdate: minutesAgo(90) })];
    expect(oldestPriceAgeMinutes(rows, NOW)).toBe(90);
  });

  it("ignores anything with no source or no price", () => {
    const rows = [
      held({ lastPriceUpdate: minutesAgo(10) }),
      held({ quoteSymbol: null, lastPriceUpdate: minutesAgo(99999) }),
      held({ lastPriceUpdate: null }),
    ];
    expect(oldestPriceAgeMinutes(rows, NOW)).toBe(10);
  });

  it("has no answer when nothing has ever been priced", () => {
    expect(oldestPriceAgeMinutes([held({ lastPriceUpdate: null })], NOW)).toBeNull();
    expect(oldestPriceAgeMinutes([], NOW)).toBeNull();
  });
});
