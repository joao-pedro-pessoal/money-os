/**
 * Writes reviewed cover art onto the books that already exist.
 *
 *   npm run library:covers               # reads data/covers.csv
 *   npm run library:covers -- other.csv
 *   npm run library:covers -- --dry-run  # says what it would do, writes nothing
 *
 * Never invents a cover. A row with an empty cover_url is reported and skipped,
 * so you can fill the sheet in over several sittings and rerun this as often as
 * you like — it only ever writes rows a human has filled in.
 *
 * Two kinds of value work in the cover_url column:
 *   https://example.com/cover.jpg   a remote image
 *   /covers/atomic-habits.jpg       a file you put in public/covers/
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { learningResources, learningResourceMeta } from "../src/db/schema";
import { parseCoverCsv, planCoverImport, describeSkip } from "../src/lib/library/covers-import";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--")) ?? "data/covers.csv";

  const text = readFileSync(resolve(process.cwd(), file), "utf8");
  const rows = parseCoverCsv(text);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const library = await db
    .select({ id: learningResources.id, slug: learningResources.slug, title: learningResources.title })
    .from(learningResources);

  const plan = planCoverImport(rows, library);
  const idBySlug = new Map(library.map((r) => [r.slug, r.id]));

  console.log(`Read ${rows.length} rows from ${file}.`);
  console.log(`${plan.assign.length} covers to set, ${plan.skipped.length} skipped.\n`);

  for (const skip of plan.skipped) console.log(`  · ${describeSkip(skip)}`);
  if (plan.skipped.length > 0) console.log("");

  if (dryRun) {
    for (const a of plan.assign) console.log(`  would set ${a.slug} → ${a.url}`);
    console.log("\nDry run: nothing was written.");
    await pool.end();
    return;
  }

  for (const a of plan.assign) {
    const id = idBySlug.get(a.slug)!;
    // The meta row exists for anything the seed created, but a book added by
    // hand before this ran might not have one.
    const existing = await db
      .select()
      .from(learningResourceMeta)
      .where(eq(learningResourceMeta.resourceId, id));

    if (existing.length === 0) {
      await db.insert(learningResourceMeta).values({ resourceId: id, coverUrl: a.url });
    } else {
      await db
        .update(learningResourceMeta)
        .set({ coverUrl: a.url, updatedAt: new Date() })
        .where(eq(learningResourceMeta.resourceId, id));
    }
    console.log(`  set ${a.slug}`);
  }

  console.log(`\nDone. ${plan.assign.length} covers written.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
