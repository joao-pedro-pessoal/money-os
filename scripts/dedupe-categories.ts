import "dotenv/config";
import { db } from "../src/db/client";
import { categories, transactions } from "../src/db/schema";
import { eq } from "drizzle-orm";

/**
 * One-time cleanup: before the `categories.name` UNIQUE constraint existed
 * (migration 0001), re-running `npm run db:seed` could insert duplicate
 * category rows. This merges duplicates by (name, kind): keeps the oldest
 * row, re-points any transactions pointing at a duplicate to the kept row,
 * then deletes the duplicates. Safe to run multiple times.
 */
async function main() {
  const all = await db.select().from(categories);

  const groups = new Map<string, typeof all>();
  for (const c of all) {
    const key = `${c.kind}::${c.name}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  let merged = 0;
  for (const [key, rows] of groups) {
    if (rows.length <= 1) continue;
    const [keep, ...dupes] = rows;
    for (const dupe of dupes) {
      await db.update(transactions).set({ categoryId: keep.id }).where(eq(transactions.categoryId, dupe.id));
      await db.delete(categories).where(eq(categories.id, dupe.id));
      merged++;
    }
    console.log(`Merged ${dupes.length} duplicate(s) of "${key}" into one.`);
  }

  console.log(merged === 0 ? "No duplicate categories found." : `Done — merged ${merged} duplicate categories.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
