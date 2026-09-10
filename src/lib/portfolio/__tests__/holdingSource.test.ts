import { describe, it, expect } from "vitest";
import { decideAuthority, partitionBySource, HOLDING_SOURCES } from "../holdingSource";

describe("who owns an account's positions", () => {
  it("prefers the live sync when both a sync and a statement exist", () => {
    // Trading 212 does both. Replaying its statement beside its live positions
    // would show every share twice — the eighth outing for the double-counting
    // bug, and the reason this module exists at all.
    const d = decideAuthority({ connector: true, statement: true, manual: false });

    expect(d.authoritative).toBe("connector");
    expect(d.crossChecks).toEqual(["statement"]);
    expect(d.roles.statement).toBe("cross-check");
  });

  it("uses the statement when that is all there is", () => {
    // Trade Republic: no API, so the export is the only record of the shares.
    const d = decideAuthority({ connector: false, statement: true, manual: false });

    expect(d.authoritative).toBe("statement");
    expect(d.crossChecks).toEqual([]);
  });

  it("honours a declared choice over the default order", () => {
    const d = decideAuthority({ connector: true, statement: true, manual: false }, "statement");

    expect(d.authoritative).toBe("statement");
    expect(d.crossChecks).toEqual(["connector"]);
  });

  it("says so when the declared source has no data to give", () => {
    // Silently substituting is how you end up staring at numbers from a source
    // you thought you had turned off.
    const d = decideAuthority({ connector: true, statement: false, manual: false }, "statement");

    expect(d.authoritative).toBe("connector");
    expect(d.explanation).toMatch(/no data yet/i);
  });

  it("admits when it knows nothing", () => {
    const d = decideAuthority({ connector: false, statement: false, manual: false });

    expect(d.authoritative).toBeNull();
    expect(d.roles.connector).toBe("absent");
    expect(d.explanation).toMatch(/no holdings/i);
  });

  it("never marks two sources authoritative", () => {
    // The property that actually matters. Every combination, every declared
    // preference: exactly one source can feed a total.
    const flags = [false, true];
    const declarations = [null, ...HOLDING_SOURCES.map((s) => s.value)] as const;

    for (const connector of flags) {
      for (const statement of flags) {
        for (const manual of flags) {
          for (const declared of declarations) {
            const d = decideAuthority({ connector, statement, manual }, declared);
            const authoritative = Object.values(d.roles).filter((r) => r === "authoritative");

            expect(authoritative.length).toBeLessThanOrEqual(1);
            expect(authoritative.length).toBe(d.authoritative === null ? 0 : 1);
            expect(d.crossChecks).not.toContain(d.authoritative);
          }
        }
      }
    }
  });
});

describe("splitting holdings into what counts and what doesn't", () => {
  it("hands back one list to total and the rest to compare against", () => {
    const { decision, counted, crossCheckOnly } = partitionBySource({
      connector: [{ key: "A" }, { key: "B" }],
      statement: [{ key: "A" }],
    });

    expect(decision.authoritative).toBe("connector");
    expect(counted).toHaveLength(2);
    expect(crossCheckOnly).toEqual([{ source: "statement", holdings: [{ key: "A" }] }]);
  });

  it("treats an empty list as no source at all", () => {
    // An account with a connector that reports nothing is not an account whose
    // holdings are "live and empty" — it is one the statement should speak for.
    const { decision } = partitionBySource({ connector: [], statement: [{ key: "A" }] });

    expect(decision.authoritative).toBe("statement");
  });

  it("returns nothing to count when there is nothing anywhere", () => {
    const { counted, crossCheckOnly } = partitionBySource({});

    expect(counted).toEqual([]);
    expect(crossCheckOnly).toEqual([]);
  });
});
