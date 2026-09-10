/**
 * "I have €800 to put away. Where does it go?"
 *
 * Fills goals in priority order: the first one to its target, then the next,
 * and so on until the money runs out. That's the point of having a hierarchy —
 * an emergency fund that's half full while the holiday fund is complete is a
 * ranking that isn't being respected.
 *
 * The output is a list of moves, not a new balance. A plan you can't act on is
 * a picture; a plan that says "move €400 from Millennium to Emergency fund" is
 * something you can actually do, and then tick off.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DistributableBucket {
  id: string;
  name: string;
  /** Lower number = more important. Ties fall back to the name. */
  priority: number;
  /** What it holds now, in base currency. */
  current: number;
  /** What it's aiming for. Null means bottomless — it never stops taking. */
  target: number | null;
}

export interface Move {
  bucketId: string;
  bucketName: string;
  amount: number;
  /** What the bucket holds once this move is made. */
  after: number;
  /** True when this move completes the goal. */
  completes: boolean;
  reason: string;
}

export interface Distribution {
  moves: Move[];
  distributed: number;
  /** Money with nowhere to go, because every goal is full. */
  leftOver: number;
  /** Goals still short after the money ran out. */
  stillShort: { id: string; name: string; missing: number }[];
}

/** Most important first. Deterministic, so the same input always plans the same. */
export function byPriority<T extends { priority: number; name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name, "pt-PT");
  });
}

/** What a bucket still needs. Null target means it can always take more. */
export function shortfall(b: DistributableBucket): number | null {
  if (b.target === null) return null;
  return round2(Math.max(0, b.target - b.current));
}

/**
 * Fills goals in priority order until the money runs out.
 *
 * A bucket with no target is skipped in the first pass, not fed first. Given a
 * bottomless goal early in the ranking it would swallow everything and starve
 * every goal below it, which is never what "this one matters most" meant.
 * Whatever is left at the end goes there instead.
 */
export function distribute(amount: number, buckets: DistributableBucket[]): Distribution {
  const moves: Move[] = [];
  let remaining = round2(Math.max(0, amount));

  const ordered = byPriority(buckets);

  // Pass one: everything with a target, in order.
  for (const b of ordered) {
    if (remaining <= 0) break;
    const need = shortfall(b);
    if (need === null || need <= 0) continue;

    const give = round2(Math.min(need, remaining));
    if (give <= 0) continue;

    remaining = round2(remaining - give);
    moves.push({
      bucketId: b.id,
      bucketName: b.name,
      amount: give,
      after: round2(b.current + give),
      completes: give >= need,
      reason:
        give >= need
          ? `Completes the goal (${round2(b.target!)}).`
          : `Priority ${b.priority}; still ${round2(need - give)} short after this.`,
    });
  }

  // Pass two: anything left goes to the highest-priority bucket with no target.
  const bottomless = ordered.find((b) => b.target === null);
  if (remaining > 0 && bottomless) {
    moves.push({
      bucketId: bottomless.id,
      bucketName: bottomless.name,
      amount: remaining,
      after: round2(bottomless.current + remaining),
      completes: false,
      reason: "Every goal with a target is full; this one has no ceiling.",
    });
    remaining = 0;
  }

  const given = new Map(moves.map((m) => [m.bucketId, m.amount]));
  const stillShort = ordered
    .map((b) => {
      const need = shortfall(b);
      if (need === null) return null;
      const missing = round2(need - (given.get(b.id) ?? 0));
      return missing > 0 ? { id: b.id, name: b.name, missing } : null;
    })
    .filter((x): x is { id: string; name: string; missing: number } => x !== null);

  return {
    moves,
    distributed: round2(moves.reduce((s, m) => s + m.amount, 0)),
    leftOver: remaining,
    stillShort,
  };
}

/**
 * The money that can actually be moved, per account.
 *
 * Distribution is only useful if it names a source. Free cash — not the whole
 * balance — because the rest is already promised to other goals, and moving it
 * twice is how a bucket ends up holding money that doesn't exist.
 */
export interface Source {
  accountId: string;
  accountName: string;
  free: number;
}

export interface SourcedMove extends Move {
  accountId: string;
  accountName: string;
}

/**
 * Attaches a source account to each move, draining the fullest account first.
 *
 * Fewer, larger transfers beat many small ones: you have to actually perform
 * these, and a plan with eleven steps doesn't get followed.
 */
export function assignSources(moves: Move[], sources: Source[]): {
  moves: SourcedMove[];
  unfunded: number;
} {
  const pots = [...sources].sort((a, b) => b.free - a.free).map((s) => ({ ...s }));
  const out: SourcedMove[] = [];
  let unfunded = 0;

  for (const move of moves) {
    let left = move.amount;

    for (const pot of pots) {
      if (left <= 0) break;
      if (pot.free <= 0) continue;

      const take = round2(Math.min(pot.free, left));
      pot.free = round2(pot.free - take);
      left = round2(left - take);

      out.push({
        ...move,
        amount: take,
        accountId: pot.accountId,
        accountName: pot.accountName,
      });
    }

    if (left > 0) unfunded = round2(unfunded + left);
  }

  return { moves: out, unfunded };
}

/** Total free cash across the sources. */
export function totalFree(sources: Source[]): number {
  return round2(sources.reduce((s, x) => s + Math.max(0, x.free), 0));
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export type Strategy = "priority" | "waterfall" | "manual";

export function isStrategy(value: string): value is Strategy {
  return value === "priority" || value === "waterfall" || value === "manual";
}

export const STRATEGIES: { value: Strategy; label: string; help: string }[] = [
  {
    value: "priority",
    label: "Share by priority",
    help: "Every goal gets something, with the important ones getting more. Goals on the same rank get equal shares.",
  },
  {
    value: "waterfall",
    label: "One at a time",
    help: "Fills the first goal to its target before the second gets anything. Fastest way to finish a goal.",
  },
  {
    value: "manual",
    label: "My own split",
    help: "Set each share yourself. Starts from the priority split so there's something to adjust.",
  },
];

export interface Share {
  id: string;
  name: string;
  percent: number;
}

/**
 * Turns a ranking into percentages.
 *
 * Linear weights: with four ranks, the top gets 4 shares and the bottom 1, so
 * 40/30/20/10. Chosen over something steeper like 1/(rank+1) because it's
 * explainable in one sentence — and a split you can't explain is one you won't
 * trust enough to leave alone.
 *
 * Equal priorities produce equal shares, which is the entire reason ties are
 * allowed: "these two matter the same" is a real thing to want to say.
 */
export function weightsFromPriority(
  buckets: { id: string; name: string; priority: number }[]
): Share[] {
  if (buckets.length === 0) return [];

  const maxPriority = Math.max(...buckets.map((b) => b.priority));
  const weights = buckets.map((b) => ({
    id: b.id,
    name: b.name,
    weight: maxPriority - b.priority + 1,
  }));

  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (total === 0) {
    return spreadEvenly(buckets.map((b) => ({ id: b.id, name: b.name })));
  }

  return largestRemainder(
    weights.map((w) => ({ id: w.id, name: w.name, raw: (w.weight / total) * 100 }))
  );
}

function spreadEvenly(items: { id: string; name: string }[]): Share[] {
  return largestRemainder(items.map((i) => ({ ...i, raw: 100 / items.length })));
}

/**
 * Rounds a set of percentages to two decimals so they still sum to exactly 100.
 *
 * Rounding each one independently leaves 99.99 or 100.01, and a split that
 * doesn't add up invites a reasonable person to distrust the whole feature.
 */
export function largestRemainder(items: { id: string; name: string; raw: number }[]): Share[] {
  const scaled = items.map((i) => ({ ...i, floor: Math.floor(i.raw * 100) }));
  const used = scaled.reduce((s, i) => s + i.floor, 0);
  let spare = 10000 - used;

  const order = [...scaled].sort((a, b) => (b.raw * 100 - b.floor) - (a.raw * 100 - a.floor));
  const bonus = new Set<string>();
  for (const item of order) {
    if (spare <= 0) break;
    bonus.add(item.id);
    spare--;
  }

  return scaled.map((i) => ({
    id: i.id,
    name: i.name,
    percent: (i.floor + (bonus.has(i.id) ? 1 : 0)) / 100,
  }));
}

/**
 * Splits an amount by percentage, without overshooting any goal.
 *
 * A share bigger than what the goal still needs is capped, and the excess is
 * offered to the others in the same proportions. Without that, a nearly-full
 * goal quietly swallows money it can't use while the rest stay short — which
 * looks like the app is ignoring its own percentages.
 *
 * Repeats until nothing more can be placed; each pass either places money or
 * ends, so it terminates.
 */
export function distributeByPercent(
  amount: number,
  buckets: DistributableBucket[],
  shares: Share[]
): Distribution {
  const given = new Map<string, number>();
  let remaining = round2(Math.max(0, amount));

  const byId = new Map(buckets.map((b) => [b.id, b]));
  const capacity = (id: string) => {
    const b = byId.get(id);
    if (!b) return 0;
    const need = shortfall(b);
    // No target means bottomless: it can always take more.
    const left = need === null ? Infinity : need - (given.get(id) ?? 0);
    return Math.max(0, left);
  };

  let active = shares.filter((s) => s.percent > 0 && capacity(s.id) > 0);

  for (let pass = 0; pass < 50 && remaining > 0.004 && active.length > 0; pass++) {
    const totalPercent = active.reduce((s, a) => s + a.percent, 0);
    if (totalPercent <= 0) break;

    const pot = remaining;
    let placed = 0;

    for (const share of active) {
      const wanted = round2((pot * share.percent) / totalPercent);
      /**
       * Also capped by what is left of the pot, not only by the goal's room.
       *
       * Each share is rounded to the cent on its own, so the rounded shares can
       * add up to more than the pot they came from — one cent per share in the
       * worst case. Without this cap the plan handed out more money than it was
       * given: €1 191.99 placed from €1 191.97, invented by arithmetic.
       *
       * Found by a property test over generated inputs; every hand-written
       * example had shares that happened to round down.
       */
      const left = round2(pot - placed);
      const give = round2(Math.min(wanted, capacity(share.id), left));
      if (give <= 0) continue;
      given.set(share.id, round2((given.get(share.id) ?? 0) + give));
      placed = round2(placed + give);
    }

    if (placed <= 0) break;
    remaining = round2(remaining - placed);
    active = active.filter((s) => capacity(s.id) > 0);
  }

  const ordered = byPriority(buckets);
  const moves: Move[] = [];

  for (const b of ordered) {
    const give = given.get(b.id) ?? 0;
    if (give <= 0) continue;
    const need = shortfall(b);
    const share = shares.find((s) => s.id === b.id)?.percent ?? 0;

    moves.push({
      bucketId: b.id,
      bucketName: b.name,
      amount: give,
      after: round2(b.current + give),
      completes: need !== null && give >= need,
      reason:
        need !== null && give >= need
          ? `Completes the goal (${round2(b.target!)}).`
          : `${share}% share of the amount.`,
    });
  }

  const stillShort = ordered
    .map((b) => {
      const need = shortfall(b);
      if (need === null) return null;
      const missing = round2(need - (given.get(b.id) ?? 0));
      return missing > 0 ? { id: b.id, name: b.name, missing } : null;
    })
    .filter((x): x is { id: string; name: string; missing: number } => x !== null);

  return {
    moves,
    distributed: round2(moves.reduce((s, m) => s + m.amount, 0)),
    leftOver: remaining,
    stillShort,
  };
}

/** Runs whichever strategy was chosen. */
export function planWith(
  strategy: Strategy,
  amount: number,
  buckets: DistributableBucket[],
  shares: Share[]
): Distribution {
  if (strategy === "waterfall") return distribute(amount, buckets);
  return distributeByPercent(amount, buckets, shares);
}

/** Normalises hand-edited percentages back to 100, keeping their proportions. */
export function normaliseShares(shares: Share[]): Share[] {
  const total = shares.reduce((s, x) => s + Math.max(0, x.percent), 0);
  if (total === 0) return spreadEvenly(shares.map((s) => ({ id: s.id, name: s.name })));
  return largestRemainder(
    shares.map((s) => ({ id: s.id, name: s.name, raw: (Math.max(0, s.percent) / total) * 100 }))
  );
}
