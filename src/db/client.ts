import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type QueryConfig } from "pg";
import * as schema from "./schema";
import { readSession, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * The database, always as the person using it.
 *
 * Every table of someone's money is limited by Postgres itself to the rows
 * whose `user_id` is the connection's `app.user_id` (row-level security, in
 * the migrations). This pool sets that on every connection it hands out: to
 * whoever `asUser` names, or else to whoever the request's session cookie
 * says is signed in, or else to nobody — and nobody sees nothing and can write
 * nothing. So the 400-odd queries in this app need no filter of their own, and
 * one that forgets one still cannot reach another person's rows.
 *
 * Two conditions make that true, and both are checked before the first query:
 *
 *  - The login in DATABASE_URL must not bypass row-level security. The
 *    database's owner does (on Neon, `neondb_owner` has BYPASSRLS), so the app
 *    connects as a login of its own, made by `npm run db:app-role`.
 *    Migrations and scripts that need the owner use DATABASE_ADMIN_URL.
 *  - The connection must be a real one, not a transaction pooler's (a
 *    `-pooler` host on Neon): a setting made on a pooled connection may be
 *    another request's by the next query.
 */

const acting = new AsyncLocalStorage<{ userId: string }>();

/** Runs `work` as this person, whatever the request's cookie says — for sign-up, cron and scripts. */
export function asUser<T>(userId: string, work: () => Promise<T>): Promise<T> {
  return acting.run({ userId }, work);
}

/** Who the next query is for: `asUser`, else the signed-in session, else nobody (""). */
async function actingUserId(): Promise<string> {
  const explicit = acting.getStore();
  if (explicit) return explicit.userId;
  try {
    // Imported here, not at the top: scripts import this module outside Next.
    const { cookies } = await import("next/headers");
    const session = await readSession((await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null);
    return session.valid ? session.userId : "";
  } catch {
    // No request here (a script, a build step): nobody.
    return "";
  }
}

const connectionString = process.env.DATABASE_URL;

function checkAddress(value: string | undefined): void {
  if (!value) return; // Failing on the first query says the same, with the driver's words.
  let host = "";
  try {
    host = new URL(value).hostname;
  } catch {
    return;
  }
  if (host.includes("-pooler")) {
    throw new Error(
      "DATABASE_URL points at a transaction pooler (-pooler). Use the direct address: each person's " +
        "rows are kept apart by a setting on the connection, which a pooler does not keep."
    );
  }
}
checkAddress(connectionString);

const pool = new Pool({ connectionString });

/** Which person each open connection is currently set to, so a repeat costs nothing. */
const setFor = new WeakMap<PoolClient, string>();

let roleChecked: Promise<void> | null = null;

async function checkRole(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ bypass: boolean }>(
    "select rolbypassrls or rolsuper as bypass from pg_roles where rolname = current_user"
  );
  if (rows[0]?.bypass) {
    throw new Error(
      "DATABASE_URL connects as a login that ignores row-level security, so every person would see " +
        "everyone's money. Connect as the app's own login instead: npm run db:app-role."
    );
  }
}

/**
 * The pool drizzle is given. Named so drizzle treats it as a pool — it checks
 * the class name — and giving out only connections already set to the right
 * person.
 */
class ActingPool {
  async connect(): Promise<PoolClient> {
    const client = await pool.connect();
    try {
      roleChecked ??= checkRole(client).catch((e) => {
        roleChecked = null;
        throw e;
      });
      await roleChecked;
      const userId = await actingUserId();
      if (setFor.get(client) !== userId) {
        await client.query("select set_config('app.user_id', $1, false)", [userId]);
        setFor.set(client, userId);
      }
      return client;
    } catch (e) {
      client.release(e instanceof Error ? e : true);
      throw e;
    }
  }

  async query(config: string | QueryConfig, values?: unknown[]) {
    const client = await this.connect();
    try {
      return await client.query(config as QueryConfig, values);
    } finally {
      client.release();
    }
  }

  end(): Promise<void> {
    return pool.end();
  }
}

export const db = drizzle(new ActingPool() as unknown as Pool, { schema });
