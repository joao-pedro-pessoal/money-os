/**
 * Editorial order: which resource the library puts first, and why.
 *
 * The application takes a position — one book is presented as the greatest of
 * all time — and that position is *data*, not a string comparison. Nothing in
 * this file knows any title. A resource leads because it carries
 * `editorialRank` and `heroFeatured`, so the claim can be read in the database,
 * changed without a deploy, and tested without fixtures that hard-code a name.
 *
 * The rule that matters: a ranked resource is never displaced by an unranked
 * one, however recent, however featured. `featured` is a shelf; `editorialRank`
 * is a judgement, and judgements outrank shelves.
 *
 * Pure — no DB, no React.
 */

export interface Rankable {
  editorialRank: number | null;
  heroFeatured: boolean;
  featured: boolean;
  updatedAt: Date;
}

/** Unranked sorts after every ranked resource, not before rank 0. */
const rankOf = (r: Rankable): number =>
  r.editorialRank === null || !Number.isFinite(r.editorialRank)
    ? Number.POSITIVE_INFINITY
    : r.editorialRank;

/**
 * Editorial rank first, then featured, then most recently touched.
 *
 * Ties on rank can't happen for rank 1 (the column is unique), but they can for
 * anything the user sets by hand, so the comparator stays total.
 */
export function compareEditorial(a: Rankable, b: Rankable): number {
  const ra = rankOf(a);
  const rb = rankOf(b);
  // Compared, not subtracted: both are Infinity when neither is ranked, and
  // Infinity - Infinity is NaN, which makes the comparator return NaN and the
  // sort do whatever it likes. Two unranked resources must fall through to the
  // tie-breakers below instead.
  if (ra !== rb) return ra < rb ? -1 : 1;

  if (a.featured !== b.featured) return a.featured ? -1 : 1;

  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

/** A new array in editorial order; the input is left alone. */
export function sortForDisplay<T extends Rankable>(items: readonly T[]): T[] {
  return [...items].sort(compareEditorial);
}

/**
 * The one resource that gets the hero slot, or null.
 *
 * Only a `heroFeatured` resource is eligible, and among those the lowest rank
 * wins — so adding a second hero-flagged book can promote it to second place
 * but can never take the top slot from rank 1. An eligible resource with no
 * rank at all sits behind every ranked one.
 */
export function heroResource<T extends Rankable>(items: readonly T[]): T | null {
  const eligible = items.filter((r) => r.heroFeatured);
  if (eligible.length === 0) return null;
  return sortForDisplay(eligible)[0];
}

/** True when this is the resource the application puts above all others. */
export function isEditorialFirst(item: Rankable): boolean {
  return item.editorialRank === 1;
}

export interface RankedRow {
  id: string;
  editorialRank: number | null;
}

export interface RankPlan {
  /** Rows to set back to no rank, before anything is assigned. */
  clear: string[];
  /** Rows to give a rank to, once the numbers are free. */
  assign: { id: string; rank: number }[];
}

/**
 * How to move a set of rows to a new set of ranks without colliding.
 *
 * `editorial_rank` is unique in the database, so this cannot be done row by
 * row: giving book A rank 3 while book B still holds it fails, and whether it
 * fails depends on the order the rows happen to come back in. Renumbering a
 * shelf is nearly always a permutation, so the collision is the normal case
 * rather than the edge case.
 *
 * Every ranked row is cleared first — including rows that aren't being
 * reassigned, because one of them may be sitting on a number that is about to
 * be handed to someone else. Clearing more than strictly necessary costs one
 * statement; clearing too little costs a half-finished update.
 *
 * The caller must run both phases in a single transaction, or a failure
 * between them leaves the library with no order at all.
 */
export function planRankUpdate(
  current: readonly RankedRow[],
  desired: readonly { id: string; rank: number | undefined }[]
): RankPlan {
  const clear = current.filter((r) => r.editorialRank !== null).map((r) => r.id);

  const assign = desired
    .filter((d): d is { id: string; rank: number } => typeof d.rank === "number")
    // Ties would fail the unique constraint just as surely; the first one wins
    // and the rest are left unranked rather than aborting the whole refresh.
    .filter((d, i, all) => all.findIndex((x) => x.rank === d.rank) === i);

  return { clear, assign };
}

/**
 * Does this set hold at most one claim to the top position?
 *
 * The database enforces it with a unique constraint; this exists so seed data
 * and imported backups can be checked before they reach it, and so the rule is
 * visible in one place rather than only in a migration.
 */
export function hasSingleTopRank(items: readonly Rankable[]): boolean {
  return items.filter(isEditorialFirst).length <= 1;
}
