/**
 * What has not been classified, and how much of the portfolio that is.
 *
 * The analysis page splits the portfolio by risk, expected return, horizon and
 * liquidity. Anything unset falls into a group called `unset` — visible, but as
 * one slice among many, which reads as a category rather than as an admission.
 *
 * On the live account **none of twenty-six positions carried all four tags**
 * and 780 € of 850 sat in positions that were only partly classified. Every
 * breakdown on that page was therefore mostly describing the absence of an
 * answer, and the page said so only if you noticed that the biggest slice was
 * called "unset".
 *
 * So this counts it directly: how many positions, and how much money, are
 * missing each axis. A breakdown built on 8% of the portfolio is not wrong, but
 * presenting it without saying that is.
 *
 * Pure — no DB, no React.
 */

export const ALLOCATION_AXES = [
  { key: "riskLevel", label: "Risk" },
  { key: "expectedReturn", label: "Expected return" },
  { key: "timeHorizon", label: "Horizon" },
  { key: "liquidity", label: "Liquidity" },
] as const;

export type AllocationAxis = (typeof ALLOCATION_AXES)[number]["key"];

export interface TaggablePosition {
  /** What the screen calls it. */
  symbol: string;
  /** Market value in the base currency, for weighting the gap by money. */
  value: number;
  riskLevel?: string | null;
  expectedReturn?: string | null;
  timeHorizon?: string | null;
  liquidity?: string | null;
}

/** True when an axis has actually been answered. "" is not an answer. */
function isSet(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

export interface AxisCoverage {
  axis: AllocationAxis;
  label: string;
  /** Positions carrying an answer on this axis. */
  tagged: number;
  /** Positions with none. */
  untagged: number;
  /** Market value behind the positions with none. */
  untaggedValue: number;
  /**
   * Share of the portfolio's value that *is* classified on this axis, 0-100.
   *
   * Null when the portfolio is worth nothing, because a percentage of zero is
   * not zero percent — it is a question with no answer.
   */
  coverage: number | null;
}

/** How much of the portfolio each axis actually describes. */
export function axisCoverage(positions: readonly TaggablePosition[]): AxisCoverage[] {
  const total = positions.reduce((sum, p) => sum + p.value, 0);

  return ALLOCATION_AXES.map(({ key, label }) => {
    const untaggedPositions = positions.filter((p) => !isSet(p[key]));
    const untaggedValue = untaggedPositions.reduce((sum, p) => sum + p.value, 0);

    return {
      axis: key,
      label,
      tagged: positions.length - untaggedPositions.length,
      untagged: untaggedPositions.length,
      untaggedValue: round2(untaggedValue),
      coverage: total === 0 ? null : round2(((total - untaggedValue) / total) * 100),
    };
  });
}

export interface PositionGap {
  symbol: string;
  value: number;
  /** The axes with no answer, in the order the form asks them. */
  missing: { axis: AllocationAxis; label: string }[];
}

/**
 * Positions with at least one axis unanswered, worth the most first.
 *
 * Ordered by money rather than by how many tags are missing: classifying the
 * €105 holding moves every breakdown on the page, and classifying the €0.13 one
 * moves nothing. A list ordered by incompleteness would put them the other way
 * round and quietly waste the effort.
 */
export function positionsNeedingTags(positions: readonly TaggablePosition[]): PositionGap[] {
  return positions
    .map((p) => ({
      symbol: p.symbol,
      value: round2(p.value),
      missing: ALLOCATION_AXES.filter(({ key }) => !isSet(p[key])).map(({ key, label }) => ({
        axis: key,
        label,
      })),
    }))
    .filter((p) => p.missing.length > 0)
    .sort((a, b) => b.value - a.value);
}

export interface TaggingSummary {
  positions: number;
  /** Positions with every axis answered. */
  complete: number;
  /** Positions with no axis answered at all. */
  untouched: number;
  /** Value held in positions that are not fully classified. */
  incompleteValue: number;
  /** The weakest axis, which is the one worth filling in first. */
  weakest: AxisCoverage | null;
}

export function taggingSummary(positions: readonly TaggablePosition[]): TaggingSummary {
  const coverage = axisCoverage(positions);
  const gaps = positionsNeedingTags(positions);

  return {
    positions: positions.length,
    complete: positions.length - gaps.length,
    untouched: positions.filter((p) => ALLOCATION_AXES.every(({ key }) => !isSet(p[key]))).length,
    incompleteValue: round2(gaps.reduce((sum, g) => sum + g.value, 0)),
    // Lowest coverage first; an axis nothing answers is the one to start on.
    weakest:
      coverage.length === 0
        ? null
        : [...coverage].sort((a, b) => (a.coverage ?? 0) - (b.coverage ?? 0))[0],
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
