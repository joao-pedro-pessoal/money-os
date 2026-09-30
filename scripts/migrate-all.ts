import "dotenv/config";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * `npm run db:migrate-all`: this installation's database, and every person's
 * copy listed in instances/ (scripts/new-person.ts), brought to the current
 * schema.
 *
 * Every copy runs the same code from the same repository, so a push that
 * needs a new column reaches all of them at once. Their databases have to
 * have it first: run this before pushing a change with a migration in it.
 * Each copy is migrated as its own login, the one its site connects as.
 */

async function migrateOne(label: string, url: string) {
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log(`${label}: up to date.`);
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set in .env.");
  await migrateOne("this installation", process.env.DATABASE_URL);

  const folder = join(process.cwd(), "instances");
  if (!existsSync(folder)) return;
  let failed = 0;
  for (const file of readdirSync(folder).filter((f) => f.endsWith(".env")).sort()) {
    const line = readFileSync(join(folder, file), "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    const name = file.replace(/\.env$/, "");
    if (!line) {
      console.error(`${name}: no DATABASE_URL in instances/${file}; skipped.`);
      failed++;
      continue;
    }
    try {
      await migrateOne(name, line.slice("DATABASE_URL=".length));
    } catch (e) {
      console.error(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
