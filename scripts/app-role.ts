import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

/**
 * `npm run db:app-role`: the database login the app connects as.
 *
 * Each person's rows are kept apart by row-level security, which the
 * database's owner bypasses (on Neon, `neondb_owner` has BYPASSRLS). So the
 * app must not connect as the owner. This makes `moneyos_app`, a login that
 * can read and write rows and nothing else — no BYPASSRLS, no changing tables
 * — and gives it every table the migrations make, now and later.
 *
 * Then `.env` is rewritten so the app connects as it (DATABASE_URL) and
 * migrations keep the owner (DATABASE_ADMIN_URL), and `for-vercel.txt` —
 * ignored by Git — holds the one line the hosted copy needs instead of its
 * current DATABASE_URL. Nothing secret is printed.
 *
 * Run again, it only refreshes the grants; `--new-password` also gives the
 * login a new password (and every copy of the app then needs the new line).
 *
 * With APP_DB_PASSWORD set (the Docker setup), that is the password, set on
 * every run, and neither file is written: the environment already holds both
 * addresses.
 */

const ROLE = "moneyos_app";
const ENV_FILE = join(process.cwd(), ".env");
const VERCEL_FILE = join(process.cwd(), "for-vercel.txt");

function setLine(text: string, name: string, value: string): string {
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
}

async function main() {
  const newPassword = process.argv.includes("--new-password");
  const given = process.env.APP_DB_PASSWORD?.trim() || null;
  if (given !== null && !/^[A-Za-z0-9_-]{16,}$/.test(given)) {
    throw new Error("APP_DB_PASSWORD must be at least 16 letters, digits, - or _ (it goes into an address).");
  }
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL is not set in .env.");
  const admin = new URL(adminUrl);
  if (decodeURIComponent(admin.username) === ROLE) {
    throw new Error(`.env has no DATABASE_ADMIN_URL and DATABASE_URL is already ${ROLE}: give the owner's address as DATABASE_ADMIN_URL.`);
  }

  const pool = new Pool({ connectionString: adminUrl });
  const database = decodeURIComponent(admin.pathname.replace(/^\//, ""));
  let password: string | null = null;
  try {
    const existing = await pool.query("select 1 from pg_roles where rolname = $1", [ROLE]);
    if (existing.rowCount === 0 || newPassword || given !== null) {
      // base64url: nothing a quoted literal must escape.
      password = given ?? randomBytes(32).toString("base64url");
      await pool.query(
        existing.rowCount === 0
          ? `create role "${ROLE}" with login nosuperuser nobypassrls nocreatedb nocreaterole password '${password}'`
          : `alter role "${ROLE}" with password '${password}'`
      );
      console.log(existing.rowCount === 0 ? `Login ${ROLE} created.` : `Login ${ROLE} has a new password.`);
    }
    // The name comes from the owner's own address; quoted as an identifier.
    await pool.query(`grant connect on database "${database.replace(/"/g, '""')}" to "${ROLE}"`);
    await pool.query(`grant usage on schema public to "${ROLE}"`);
    await pool.query(`grant select, insert, update, delete on all tables in schema public to "${ROLE}"`);
    await pool.query(`grant usage, select on all sequences in schema public to "${ROLE}"`);
    // Tables the migrations make later, made by the owner, are the app's too.
    await pool.query(
      `alter default privileges for role current_user in schema public grant select, insert, update, delete on tables to "${ROLE}"`
    );
    await pool.query(`alter default privileges for role current_user in schema public grant usage, select on sequences to "${ROLE}"`);
    const check = await pool.query<{ bypass: boolean }>(
      "select rolbypassrls or rolsuper as bypass from pg_roles where rolname = $1",
      [ROLE]
    );
    if (check.rows[0]?.bypass) throw new Error(`${ROLE} bypasses row-level security; it must not.`);
    console.log("Grants in place.");
  } finally {
    await pool.end();
  }

  if (given !== null) return;
  if (password === null) {
    console.log(".env left as it is: the login already existed. Use --new-password to make a new address for it.");
    return;
  }
  const appUrl = new URL(adminUrl);
  appUrl.username = ROLE;
  appUrl.password = password;

  let env = readFileSync(ENV_FILE, "utf8");
  if (!/^DATABASE_ADMIN_URL=/m.test(env)) env = setLine(env, "DATABASE_ADMIN_URL", adminUrl);
  env = setLine(env, "DATABASE_URL", appUrl.toString());
  writeFileSync(ENV_FILE, env, "utf8");
  writeFileSync(
    VERCEL_FILE,
    [
      "Vercel -> the project -> Settings -> Environment Variables:",
      "replace DATABASE_URL with the value below (no quotes), then Deployments -> ... -> Redeploy.",
      "Delete this file afterwards. Git ignores it.",
      "",
      appUrl.toString(),
      "",
    ].join("\n"),
    "utf8"
  );
  console.log(".env updated: DATABASE_URL is the app's login, DATABASE_ADMIN_URL the owner's.");
  console.log("The value for Vercel is in for-vercel.txt.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
