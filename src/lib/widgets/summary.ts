/**
 * The shape the Android home-screen widgets read.
 *
 * A widget draws a few figures and a small chart on a phone that fetches them
 * over home Wi-Fi, so the payload is trimmed here: a line of a few dozen
 * points, and the biggest places the money sits with the rest folded into one.
 * Every figure is one the dashboard already shows; nothing is computed only for
 * a widget, so the two cannot disagree.
 */

export interface WidgetPoint {
  date: string;
  value: number;
}

export interface WidgetSlice {
  name: string;
  value: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * At most `max` points, always keeping the first and the last.
 *
 * The last point is today's figure, and a line that stops short of it would
 * disagree with the number printed beside it.
 */
export function downsample(points: WidgetPoint[], max: number): WidgetPoint[] {
  if (max < 2 || points.length <= max) return points.map((p) => ({ date: p.date, value: round2(p.value) }));
  const step = (points.length - 1) / (max - 1);
  const picked: WidgetPoint[] = [];
  for (let i = 0; i < max; i++) {
    const p = points[Math.round(i * step)];
    picked.push({ date: p.date, value: round2(p.value) });
  }
  return picked;
}

/**
 * The `count` largest positive slices, and everything else as one "Other".
 *
 * Empty and negative accounts are left out, as the dashboard's donut leaves
 * them out: a slice cannot be negative.
 */
export function topSlices(items: WidgetSlice[], count: number): WidgetSlice[] {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const top = positive.slice(0, count).map((i) => ({ name: i.name, value: round2(i.value) }));
  const rest = positive.slice(count).reduce((s, i) => s + i.value, 0);
  return rest > 0 ? [...top, { name: "Other", value: round2(rest) }] : top;
}

export interface WidgetPosition {
  name: string;
  value: number;
  /** Null when nothing measured a result: cash, an unknown cost, a price at cost. */
  pnl: number | null;
  /** Return on cost, the Investments page's measure. Null without a positive cost. */
  percent: number | null;
}

/**
 * The `count` largest positions by value, each with its result when one was
 * measured. A missing result stays null rather than becoming a flat 0.
 */
export function topPositions(
  items: { name: string; value: number; pnl: number; measured: boolean }[],
  count: number = Infinity
): WidgetPosition[] {
  return [...items]
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((i) => {
      const cost = i.value - i.pnl;
      return {
        name: i.name,
        value: round2(i.value),
        pnl: i.measured ? round2(i.pnl) : null,
        percent: i.measured && cost > 0 ? round2((i.pnl / cost) * 100) : null,
      };
    });
}

export interface WidgetMover {
  name: string;
  pnl: number;
  /** On what the position cost: the same measure the Investments page uses. */
  percent: number;
}

/**
 * The best and the worst positions by return on cost.
 *
 * Only positions with a measured result and a positive cost take part: a
 * percentage on an unknown or zero cost is not a small number, it is no number.
 * A position appears in one list only, so a portfolio of three is not shown
 * twice.
 */
export function movers(
  items: { name: string; value: number; pnl: number; measured: boolean }[],
  count: number
): { best: WidgetMover[]; worst: WidgetMover[] } {
  const ranked = items
    .filter((i) => i.measured && i.value - i.pnl > 0)
    .map((i) => ({ name: i.name, pnl: round2(i.pnl), percent: round2((i.pnl / (i.value - i.pnl)) * 100) }))
    .sort((a, b) => b.percent - a.percent);
  const best = ranked.slice(0, count).filter((m) => m.percent > 0);
  const worst = ranked
    .slice(best.length)
    .reverse()
    .slice(0, count)
    .filter((m) => m.percent < 0);
  return { best, worst };
}
