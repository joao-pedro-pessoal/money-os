import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * The journal and the folder must agree.
 *
 * `drizzle-kit migrate` applies what `drizzle/meta/_journal.json` lists and
 * ignores every other `.sql` file **in silence**. CLAUDE.md warns about this in
 * bold and it happened anyway: `0012_smooth_ledger.sql` sat in the folder for
 * weeks with no journal entry, colliding on index 12 with the generated
 * `0012_whole_firelord.sql`, and would never have run.
 *
 * It was harmless — the journalled file created the same three tables — but the
 * next one will not be, and the failure it produces is `column "x" does not
 * exist` at runtime, far from the cause, looking exactly like a code bug.
 *
 * Reads the real folder rather than a fixture on purpose: a fixture would prove
 * something about a fixture.
 */

const drizzleDir = path.resolve(__dirname, "../../../drizzle");

interface Journal {
  entries: { idx: number; tag: string; when: number }[];
}

const journal: Journal = JSON.parse(
  readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
);
const sqlFiles = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));

describe("migrations", () => {
  it("has a journal entry for every .sql file", () => {
    const journalled = new Set(journal.entries.map((e) => `${e.tag}.sql`));
    const orphans = sqlFiles.filter((f) => !journalled.has(f));

    expect(
      orphans,
      `These migrations will be skipped silently by drizzle-kit. They were ` +
        `almost certainly hand-written; delete them and run \`npm run db:generate\`.`
    ).toEqual([]);
  });

  it("has a .sql file for every journal entry", () => {
    const present = new Set(sqlFiles);
    const missing = journal.entries.map((e) => `${e.tag}.sql`).filter((f) => !present.has(f));

    expect(missing, "The journal lists migrations that no longer exist.").toEqual([]);
  });

  /**
   * Two files sharing an index is how the orphan hid: sorted listings put them
   * side by side and one looks like a rename of the other.
   */
  it("uses each numeric prefix exactly once", () => {
    const byPrefix = new Map<string, string[]>();
    for (const f of sqlFiles) {
      const prefix = f.slice(0, 4);
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), f]);
    }
    const duplicated = [...byPrefix.entries()].filter(([, files]) => files.length > 1);

    expect(duplicated, "Two migrations claim the same index.").toEqual([]);
  });
});
