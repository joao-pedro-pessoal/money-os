/**
 * Which source owns an account's positions.
 *
 * Reconstructing holdings from a statement creates a second way to know what an
 * account holds, and this codebase has a history with second ways to know
 * things: the same money reachable through two paths has been counted twice
 * seven times now. Trading 212 both syncs live positions *and* exports a
 * statement, so replaying that statement beside the live sync would double the
 * portfolio — every share appearing once from each.
 *
 * The fix is the same one that worked for `balancesAreSeparatePool` and
 * `balanceMeaning`: **the account declares which source is authoritative**, and
 * nothing infers it. Inference is what produced the bug each time.
 *
 * The other source isn't discarded. It becomes a cross-check — see
 * `compareWithReported` in `reconstruct.ts` — which is how the app notices that
 * a statement has gone out of date.
 *
 * Pure — no DB, no I/O.
 */

export const HOLDING_SOURCES = [
  {
    value: "connector",
    label: "Live sync",
    description: "The platform reports its own positions. Always current, needs an API.",
  },
  {
    value: "statement",
    label: "Imported statement",
    description:
      "Rebuilt from your transaction export. Exact as of the last import, and no older than it.",
  },
  {
    value: "manual",
    label: "Entered by hand",
    description: "You keep the positions up to date yourself.",
  },
] as const;

export type HoldingSource = (typeof HOLDING_SOURCES)[number]["value"];

export type Role = "authoritative" | "cross-check" | "absent";

export interface SourceAvailability {
  /** A connector is syncing positions for this account right now. */
  connector: boolean;
  /** A statement has been imported and reconstructed into holdings. */
  statement: boolean;
  /** Positions were typed in. */
  manual: boolean;
}

export interface AuthorityDecision {
  /** The source whose numbers go into totals. Null when there are none. */
  authoritative: HoldingSource | null;
  /** Present, but must not be added to any total. */
  crossChecks: HoldingSource[];
  roles: Record<HoldingSource, Role>;
  /** Why, in words — this ends up on screen next to the figure. */
  explanation: string;
}

/**
 * Decides which source counts.
 *
 * `declared` wins whenever that source actually has data, because the user's
 * choice is the point. When it doesn't, the fallback order is live sync, then
 * statement, then manual — most current first — and the explanation says a
 * substitution happened rather than quietly making one.
 */
export function decideAuthority(
  available: SourceAvailability,
  declared: HoldingSource | null = null
): AuthorityDecision {
  const has = (s: HoldingSource): boolean => available[s];
  const preference: HoldingSource[] = ["connector", "statement", "manual"];

  const chosen =
    declared !== null && has(declared)
      ? declared
      : (preference.find(has) ?? null);

  const crossChecks = preference.filter((s) => has(s) && s !== chosen);

  const roles = {
    connector: roleOf("connector"),
    statement: roleOf("statement"),
    manual: roleOf("manual"),
  } as Record<HoldingSource, Role>;

  function roleOf(s: HoldingSource): Role {
    if (!has(s)) return "absent";
    return s === chosen ? "authoritative" : "cross-check";
  }

  return {
    authoritative: chosen,
    crossChecks,
    roles,
    explanation: explain(chosen, crossChecks, declared),
  };
}

function explain(
  chosen: HoldingSource | null,
  crossChecks: HoldingSource[],
  declared: HoldingSource | null
): string {
  if (chosen === null) return "No holdings are known for this account yet.";

  const name = (s: HoldingSource) =>
    HOLDING_SOURCES.find((o) => o.value === s)?.label ?? s;

  const overridden =
    declared !== null && declared !== chosen
      ? ` You chose ${name(declared)}, which has no data yet, so this is being used instead.`
      : "";

  if (crossChecks.length === 0) {
    return `Holdings come from ${name(chosen).toLowerCase()}.${overridden}`;
  }

  return (
    `Holdings come from ${name(chosen).toLowerCase()}. ` +
    `${crossChecks.map(name).join(" and ")} ${crossChecks.length === 1 ? "is" : "are"} kept as a cross-check and not added to any total.${overridden}`
  );
}

/**
 * Splits holdings into what counts and what doesn't.
 *
 * The shape is deliberately awkward to misuse: `counted` and `crossCheckOnly`
 * are separate arrays, so adding the wrong one to a total is a thing you have
 * to type on purpose rather than something you get by forgetting a filter.
 */
export function partitionBySource<T>(
  bySource: Partial<Record<HoldingSource, T[]>>,
  declared: HoldingSource | null = null
): {
  decision: AuthorityDecision;
  counted: T[];
  crossCheckOnly: { source: HoldingSource; holdings: T[] }[];
} {
  const nonEmpty = (s: HoldingSource): boolean => (bySource[s]?.length ?? 0) > 0;

  const decision = decideAuthority(
    { connector: nonEmpty("connector"), statement: nonEmpty("statement"), manual: nonEmpty("manual") },
    declared
  );

  return {
    decision,
    counted: decision.authoritative === null ? [] : (bySource[decision.authoritative] ?? []),
    crossCheckOnly: decision.crossChecks.map((source) => ({
      source,
      holdings: bySource[source] ?? [],
    })),
  };
}
