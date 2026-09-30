import "dotenv/config";
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { categories } from "../src/db/schema";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../src/db/defaultCategories";

/**
 * A copy of Money OS for one more person: `npm run new-person -- ana ana@mail.pt`.
 *
 * Each person gets the whole app — every page, not the vault's few — with a
 * database of their own, next to yours on the same Postgres server. This makes
 * that database, brings it to the current schema, gives it the starting
 * categories, and writes what their Vercel project needs to
 * `instances/<name>.env`, which Git ignores. See docs/UMA_COPIA_POR_PESSOA.md.
 *
 * Nothing secret is printed: the password and the connection string are in
 * that file only. Run again for the same name, it keeps the file as it is and
 * only brings the database up to date — which is also how a copy gets a new
 * migration.
 */

const NAME = /^[a-z][a-z0-9]{1,19}$/;
const PASSWORD_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

function readablePassword(): string {
  // Four groups of five from 31 unambiguous characters: about 99 bits.
  const group = () => Array.from({ length: 5 }, () => PASSWORD_LETTERS[randomInt(PASSWORD_LETTERS.length)]).join("");
  return [group(), group(), group(), group()].join("-");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const [name, email = ""] = process.argv.slice(2);
  if (!name || !NAME.test(name)) {
    fail("Usage: npm run new-person -- <name> [email]\n<name>: lowercase letters and digits, starting with a letter (e.g. ana).");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not an email address.`);
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set in .env.");

  const ownUrl = new URL(process.env.DATABASE_URL);
  // The database and the login that owns it share a name. NAME above is what
  // makes it safe to write into SQL, where a name cannot be a parameter.
  const database = `moneyos_${name}`;
  if (ownUrl.pathname.replace(/^\//, "") === database) fail(`${database} is this installation's own database.`);

  const folder = join(process.cwd(), "instances");
  const file = join(folder, `${name}.env`);
  const kept = existsSync(file) ? readFileSync(file, "utf8") : null;

  /**
   * Their copy connects as a login of its own, which owns their database and
   * nothing else — never as this installation's, which can open every
   * database on the server, this one included. The address sits in their
   * Vercel project; what it opens should be theirs alone.
   */
  let personUrl: URL;
  if (kept) {
    const line = kept.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    personUrl = new URL(line ? line.slice("DATABASE_URL=".length) : "invalid:");
    if (personUrl.username !== database || personUrl.pathname !== `/${database}`) {
      fail(`instances/${name}.env points at another database or login. Look at it before going on.`);
    }
  } else {
    personUrl = new URL(ownUrl);
    personUrl.username = database;
    personUrl.password = randomBytes(32).toString("base64url");
    personUrl.pathname = `/${database}`;
  }

  const server = new Pool({ connectionString: ownUrl.toString() });
  try {
    const role = await server.query("select 1 from pg_roles where rolname = $1", [database]);
    // base64url: letters, digits, - and _, nothing a quoted literal must escape.
    const password = decodeURIComponent(personUrl.password);
    if (!/^[A-Za-z0-9_-]{32,}$/.test(password)) fail(`The password in instances/${name}.env is not one this script made.`);
    if (role.rowCount === 0) {
      await server.query(`create role "${database}" with login password '${password}'`);
      console.log(`Login ${database} created.`);
    } else if (!kept) {
      // The login exists but its file is gone: it gets a new password, written below.
      await server.query(`alter role "${database}" with password '${password}'`);
      console.log(`Login ${database} existed; it has a new password.`);
    }
    // Membership, so this login may hand the new database to that one.
    await server.query(`grant "${database}" to current_user`);

    const found = await server.query("select 1 from pg_database where datname = $1", [database]);
    if (found.rowCount === 0) {
      await server.query(`create database "${database}" owner "${database}"`);
      console.log(`Database ${database} created.`);
    } else {
      await server.query(`alter database "${database}" owner to "${database}"`);
      console.log(`Database ${database} already exists; bringing it up to date.`);
    }
    // No other login connects to it; its own does, as the owner.
    await server.query(`revoke connect on database "${database}" from public`);
  } finally {
    await server.end();
  }

  // Its tables, and the categories every installation starts with.
  const pool = new Pool({ connectionString: personUrl.toString() });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    for (const categoryName of DEFAULT_INCOME_CATEGORIES) {
      await db.insert(categories).values({ name: categoryName, kind: "income" }).onConflictDoNothing();
    }
    for (const categoryName of DEFAULT_EXPENSE_CATEGORIES) {
      await db.insert(categories).values({ name: categoryName, kind: "expense" }).onConflictDoNothing();
    }
    console.log("Tables and starting categories in place.");
  } finally {
    await pool.end();
  }

  // What their Vercel project needs. Written once: a second run must not
  // change a password the person already uses.
  if (kept) {
    console.log(`Kept instances/${name}.env as it was.`);
    return;
  }
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    file,
    [
      `# Money OS for ${name}. Paste all of this into that person's Vercel project:`,
      "# Settings -> Environment Variables. Values without quotes, as below.",
      "# Keep this file private: it opens their copy. Git ignores this folder.",
      `DATABASE_URL=${personUrl.toString()}`,
      `APP_EMAIL=${email}`,
      `APP_PASSWORD=${readablePassword()}`,
      `APP_SECRET=${randomBytes(32).toString("base64url")}`,
      "COOKIE_SECURE=true",
      "# Their copy is theirs alone: no vault accounts on it.",
      "SYNC_MAX_ACCOUNTS=0",
      "",
    ].join("\n"),
    { encoding: "utf8", flag: "wx" }
  );
  console.log(`Wrote instances/${name}.env — what their Vercel project needs, password included.`);
  if (!email) console.log("APP_EMAIL is empty in it: write their email there before pasting.");
  console.log("Next: docs/UMA_COPIA_POR_PESSOA.md, from step 2.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
