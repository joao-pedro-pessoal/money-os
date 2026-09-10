import { describe, it, expect } from "vitest";
import {
  tagLabel,
  isAmbiguousTag,
  RISK_LEVELS,
  TIME_HORIZONS,
  LIQUIDITY_LEVELS,
  DIRECTIONS,
} from "../tags";

/**
 * Five values mean different things depending on which question is being
 * answered, and the labels used to be flattened into one value→label map. The
 * last vocabulary spread in won every collision, so:
 *
 *  - the **risk** breakdown labelled its groups "Low liquidity" and
 *    "High liquidity", because LIQUIDITY_LEVELS came after RISK_LEVELS;
 *  - `medium` risk showed as "Medium term";
 *  - the **horizon** breakdown showed "Long (gains when it rises)" and
 *    "Short (gains when it falls)", because DIRECTIONS came last of all.
 *
 * Three of the four allocation axes were displaying another axis's words, and
 * every one of them looked deliberate. Spotted on a screenshot of the horizon
 * chart, where "Medium term" survived beside two direction labels — the tell
 * being that `medium` collides with only one other vocabulary and `long` with
 * DIRECTIONS.
 */
describe("a label has to know which question it answers", () => {
  it("labels the five colliding values by axis", () => {
    expect(tagLabel("low", "risk")).toBe("Low risk");
    expect(tagLabel("low", "liquidity")).toBe("Low liquidity");

    expect(tagLabel("high", "risk")).toBe("High risk");
    expect(tagLabel("high", "liquidity")).toBe("High liquidity");

    expect(tagLabel("medium", "risk")).toBe("Medium risk");
    expect(tagLabel("medium", "timeHorizon")).toBe("Medium term");

    expect(tagLabel("long", "timeHorizon")).toBe("Long term");
    expect(tagLabel("long", "direction")).toBe("Long (gains when it rises)");

    expect(tagLabel("short", "timeHorizon")).toBe("Short term");
    expect(tagLabel("short", "direction")).toBe("Short (gains when it falls)");
  });

  /** The exact three the screenshot showed, asserted as the app renders them. */
  it("no longer puts direction words on a horizon chart", () => {
    expect(tagLabel("long", "timeHorizon")).not.toContain("gains when");
    expect(tagLabel("short", "timeHorizon")).not.toContain("gains when");
  });

  it("no longer puts liquidity words on a risk chart", () => {
    expect(tagLabel("low", "risk")).not.toContain("liquidity");
    expect(tagLabel("high", "risk")).not.toContain("liquidity");
    expect(tagLabel("medium", "risk")).not.toContain("term");
  });

  it("knows which values are ambiguous", () => {
    for (const value of ["low", "high", "medium", "short", "long"]) {
      expect(isAmbiguousTag(value), value).toBe(true);
    }
    expect(isAmbiguousTag("very_high")).toBe(false);
    expect(isAmbiguousTag("crypto")).toBe(false);
  });
});

describe("without an axis", () => {
  /**
   * An ambiguous value comes back unchanged rather than guessed at. "long" is
   * not a wrong answer; "Long (gains when it rises)" on a horizon chart is.
   */
  it("returns an ambiguous value as it came, rather than picking one meaning", () => {
    expect(tagLabel("long")).toBe("long");
    expect(tagLabel("low")).toBe("low");
    expect(tagLabel("medium")).toBe("medium");
  });

  it("still labels a value that means only one thing", () => {
    expect(tagLabel("very_high")).toBe("Very high risk");
    expect(tagLabel("crypto")).toBe("Crypto");
  });

  it("has nothing to say about nothing", () => {
    expect(tagLabel(null)).toBeNull();
    expect(tagLabel(undefined)).toBeNull();
    expect(tagLabel("")).toBeNull();
  });

  it("passes an unknown value straight through", () => {
    expect(tagLabel("something_nobody_defined")).toBe("something_nobody_defined");
  });
});

/**
 * Every option in every vocabulary must be labellable on its own axis. A value
 * added to one list and not reachable through it would silently render as the
 * raw code.
 */
describe("every vocabulary is fully labelled on its own axis", () => {
  const axes = [
    ["risk", RISK_LEVELS],
    ["timeHorizon", TIME_HORIZONS],
    ["liquidity", LIQUIDITY_LEVELS],
    ["direction", DIRECTIONS],
  ] as const;

  it("returns each option's own label", () => {
    for (const [axis, options] of axes) {
      for (const option of options) {
        expect(tagLabel(option.value, axis), `${axis}/${option.value}`).toBe(option.label);
      }
    }
  });

  /** And never another axis's label for the same value. */
  it("never returns a label belonging to a different axis", () => {
    for (const [axis, options] of axes) {
      for (const option of options) {
        const other = axes
          .filter(([name]) => name !== axis)
          .flatMap(([, list]) => list.filter((o) => o.value === option.value).map((o) => o.label));
        expect(other, `${axis}/${option.value}`).not.toContain(tagLabel(option.value, axis));
      }
    }
  });
});
