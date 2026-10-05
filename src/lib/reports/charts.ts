/**
 * The geometry of a report's charts, worked out once.
 *
 * The page draws them as SVG and the PDF draws them with its own pen, and the
 * two must show the same thing: the same axis, the same ticks, the same line.
 * So the drawing is split in two — this file turns figures into positions in a
 * box, and each renderer only strokes what it is handed. A line that peaks in
 * March on screen peaks in March in the file.
 *
 * Positions are measured from the box's top-left corner with y growing
 * downwards, as SVG has it; the PDF flips them when it draws.
 *
 * Pure.
 */

export interface DatedValue {
  date: string;
  value: number;
}

export interface ChartArea {
  width: number;
  height: number;
  /** Room kept for the axis labels on each side. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlottedLine {
  name: string;
  points: { x: number; y: number }[];
  /** The same points as an SVG path, for a renderer that takes one. */
  path: string;
}

export interface LineChartGeometry {
  lines: PlottedLine[];
  yTicks: { value: number; y: number }[];
  xLabels: { date: string; x: number }[];
  /** Where zero sits, when the axis crosses it, so a renderer can mark it. */
  zeroY: number | null;
}

const DAY = 86_400_000;
const dayTime = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Round numbers for an axis: 0, 500, 1000, 1500 rather than 0, 437, 874.
 *
 * The step is 1, 2, 2.5 or 5 times a power of ten, the steps people count in.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  if (ticks.at(-1)! < max) ticks.push(ticks.at(-1)! + step);
  return ticks;
}

/**
 * Lines over time in one box, sharing one value axis and one time axis.
 *
 * The time axis runs from `from` to `to` when given — the period the report is
 * about — so a line that starts late starts late on the page too, instead of
 * being stretched across the whole width as if it covered the period.
 */
export function lineChart(
  series: readonly { name: string; points: readonly DatedValue[] }[],
  area: ChartArea,
  range?: { from: string; to: string }
): LineChartGeometry {
  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p.value));
  if (all.length === 0) return { lines: [], yTicks: [], xLabels: [], zeroY: null };

  const times = all.map((p) => dayTime(p.date));
  const start = range ? dayTime(range.from) : Math.min(...times);
  const end = range ? dayTime(range.to) : Math.max(...times);
  const span = Math.max(end - start, DAY);

  const ticks = niceTicks(Math.min(...all.map((p) => p.value)), Math.max(...all.map((p) => p.value)));
  const low = ticks[0];
  const high = ticks.at(-1)!;
  const plotWidth = area.width - area.left - area.right;
  const plotHeight = area.height - area.top - area.bottom;

  const x = (date: string) => round1(area.left + ((dayTime(date) - start) / span) * plotWidth);
  const y = (value: number) => round1(area.top + (1 - (value - low) / (high - low)) * plotHeight);

  const lines = series.map((s) => {
    const points = [...s.points]
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ x: x(p.date), y: y(p.value) }));
    return {
      name: s.name,
      points,
      path: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" "),
    };
  });

  const firstDate = range ? range.from : new Date(start).toISOString().slice(0, 10);
  const lastDate = range ? range.to : new Date(end).toISOString().slice(0, 10);
  const middle = new Date(start + (end - start) / 2).toISOString().slice(0, 10);
  const xLabels =
    firstDate === lastDate
      ? [{ date: firstDate, x: x(firstDate) }]
      : [firstDate, ...(end - start > 2 * DAY ? [middle] : []), lastDate].map((date) => ({ date, x: x(date) }));

  return {
    lines,
    yTicks: ticks.map((value) => ({ value, y: y(value) })),
    xLabels,
    zeroY: low < 0 && high > 0 ? y(0) : null,
  };
}

/** Horizontal bars as a share of the longest, for a list of named amounts. */
export function barShares(items: readonly { name: string; value: number }[], limit = 8) {
  const shown = items.filter((i) => i.value > 0).slice(0, limit);
  const longest = Math.max(0, ...shown.map((i) => i.value));
  return shown.map((i) => ({ ...i, share: longest === 0 ? 0 : i.value / longest }));
}

export interface ColumnGeometry {
  groups: {
    label: string;
    /** Where the group's slot starts and how wide its columns are together. */
    x: number;
    width: number;
    /** One per value, in order; a missing or non-positive value has no height. */
    columns: { value: number | null; x: number; y: number; width: number; height: number }[];
  }[];
  yTicks: { value: number; y: number }[];
}

/**
 * Side-by-side columns per group — income beside spending, month by month.
 *
 * A group with no figures (a month with nothing recorded) keeps its place and
 * draws nothing, rather than two columns of zero that would read as a month
 * of nothing earned and nothing spent.
 */
export function columnChart(
  groups: readonly { label: string; values: (number | null)[] }[],
  area: ChartArea
): ColumnGeometry {
  const values = groups.flatMap((g) => g.values).filter((v): v is number => v !== null && Number.isFinite(v));
  if (groups.length === 0 || values.length === 0) return { groups: [], yTicks: [] };
  /**
   * Nothing above zero — a year of transfers only — is one line at zero and no
   * columns. Asked for ticks between 0 and 0, `niceTicks` pads both ways, and
   * the negative ones landed below the chart, over the labels under it.
   */
  const highest = Math.max(0, ...values);
  const ticks = highest > 0 ? niceTicks(0, highest) : [0];
  const high = ticks.at(-1)! || 1;
  const plotWidth = area.width - area.left - area.right;
  const plotHeight = area.height - area.top - area.bottom;
  const slot = plotWidth / groups.length;
  const perGroup = Math.max(1, ...groups.map((g) => g.values.length));
  const columnWidth = round1((slot * 0.7) / perGroup);
  const baseline = area.top + plotHeight;

  return {
    groups: groups.map((g, i) => {
      const x = round1(area.left + i * slot + slot * 0.15);
      return {
        label: g.label,
        x,
        width: round1(slot * 0.7),
        columns: g.values.map((value, k) => {
          const height = value === null || value <= 0 ? 0 : round1((value / high) * plotHeight);
          return { value, x: round1(x + k * columnWidth), y: round1(baseline - height), width: columnWidth, height };
        }),
      };
    }),
    yTicks: ticks.map((value) => ({ value, y: round1(area.top + (1 - value / high) * plotHeight) })),
  };
}

/**
 * An axis label short enough for the side of a chart — 950, 2125, 12.5k, 1.25M —
 * and exact: a tick is a round number, so it can be written as itself.
 *
 * Rounding it to one decimal of a thousand turned an axis stepping by 25 into
 * "2.1k, 2.1k, 2.2k, 2.2k", five lines with three names.
 */
export function compactAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${shortest(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${sign}${shortest(abs / 1_000)}k`;
  return `${sign}${shortest(abs)}`;
}

/** The fewest decimals, up to three, that write `n` as it is. */
function shortest(n: number): string {
  for (let digits = 0; digits < 3; digits++) {
    const written = Number(n.toFixed(digits));
    if (Math.abs(written - n) < 1e-9 * Math.max(1, n)) return String(written);
  }
  return String(Number(n.toFixed(3)));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Every how many groups a label fits under a column chart: every one when the
 * widest label fits its slot, otherwise every second, third… so that labels
 * never run into each other on a phone or across a long range.
 */
export function labelEvery(slot: number, widestLabel: number): number {
  if (slot <= 0) return 1;
  return Math.max(1, Math.ceil((widestLabel + 4) / slot));
}

/** "3 Mar 2026" for the ends of a time axis. */
export function shortDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}
