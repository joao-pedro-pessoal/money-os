import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { originOf, TOO_MANY_ATTEMPTS } from "@/lib/accounts/attempts";

// The real migrations on an in-memory PostgreSQL; the connection's address is set per test.
const isolated = vi.hoisted(() => ({
  db: null as unknown as PgliteDatabase<typeof schema>,
  engine: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  address: {} as Record<string, string>,
  verified: 0,
}));
vi.mock("@/db/client", () => ({
  get db() { return isolated.db; },
  asUser: async (id: string, work: () => Promise<unknown>) => {
    await isolated.engine.query("select set_config('app.user_id', $1, false)", [id]);
    return work();
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => {}, get: () => undefined }),
  headers: async () => ({ get: (name: string) => isolated.address[name] ?? null }),
}));
vi.mock("../session", () => ({ currentUserId: async () => null }));
vi.mock("../fx", () => ({ refreshRates: async () => {} }));
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE_NAME: "session", newSessionValue: async () => "signed",
  sessionCookieOptions: () => ({}), ownerPassword: () => "unused",
}));
vi.mock("@/lib/accounts/password", () => ({
  PASSWORD_MAX: 1024, needsRehash: () => false,
  hashPassword: async (key: string) => `hashed:${key}`,
  verifyPassword: async (key: string, stored: string) => { isolated.verified++; return stored === `hashed:${key}`; },
}));
import { recoverAccount, signIn, signUp } from "../auth";
import { createQrSignIn } from "../qrSignIn";

const KEY = "a".repeat(64);
const SECRET = "attempts-test-secret";
let engine: PGlite;
const from = (ip: string | null) => { isolated.address = ip ? { "x-real-ip": ip } : {}; };
const tried = (ip: string, action: string, count: number, hoursAgo = 0) =>
  engine.query(
    `insert into request_limits (id, action, origin, at) select 'seed-' || gen_random_uuid(), $1, $2, now() - make_interval(hours => $3) from generate_series(1, $4)`,
    [action, originOf(ip, SECRET), hoursAgo, count]
  );
const rows = async () => (await engine.query<{ action: string; origin: string }>("select action, origin from request_limits")).rows;

beforeAll(async () => {
  process.env.APP_SECRET = SECRET;
  process.env.MAX_ACCOUNTS = "40";
  // The owner's account is unclaimed in a fresh database: with its address named, other addresses take the normal path.
  process.env.APP_EMAIL = "owner@example.test";
  engine = new PGlite();
  isolated.engine = engine as unknown as typeof isolated.engine;
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
}, 60_000);
afterAll(async () => { await engine?.close(); });
beforeEach(async () => {
  await engine.exec("delete from request_limits; delete from users where id <> 'owner';");
  isolated.verified = 0;
});

describe("attempts per connection, in PostgreSQL with the real migrations", () => {
  it("refuses a sixth new account in an hour from one connection, not from another", async () => {
    await tried("203.0.113.7", "sign-up", 5);
    from("203.0.113.7");
    expect(await signUp({ email: "a@example.test", signInKey: KEY })).toEqual({ kind: "refused", reason: TOO_MANY_ATTEMPTS });
    from("198.51.100.2");
    expect((await signUp({ email: "b@example.test", signInKey: KEY })).kind).toBe("ok");
    const made = await engine.query<{ email: string }>("select email from users where email is not null");
    expect(made.rows.map((r) => r.email)).toEqual(["b@example.test"]);
  });

  it("refuses the 31st sign-in in ten minutes before any password is checked", async () => {
    await tried("203.0.113.7", "sign-in", 30);
    from("203.0.113.7");
    expect(await signIn({ email: "nobody@example.test", signInKey: KEY })).toEqual({ kind: "refused", reason: TOO_MANY_ATTEMPTS });
    expect(isolated.verified).toBe(0);
    from("198.51.100.2");
    expect((await signIn({ email: "nobody@example.test", signInKey: KEY })).kind).toBe("wrong");
    expect(isolated.verified).toBe(1);
  });

  it("limits recovery codes per connection too", async () => {
    await tried("203.0.113.7", "recover", 10);
    from("203.0.113.7");
    expect(await recoverAccount({ email: "a@example.test", recoveryCode: "x", signInKey: KEY })).toEqual({ kind: "refused", reason: TOO_MANY_ATTEMPTS });
  });

  it("keeps a fingerprint of the address, never the address, and forgets it after a day", async () => {
    await tried("203.0.113.7", "sign-in", 3, 25);
    from("203.0.113.7");
    await signIn({ email: "nobody@example.test", signInKey: KEY });
    const kept = await rows();
    expect(kept).toEqual([{ action: "sign-in", origin: originOf("203.0.113.7", SECRET) }]);
    expect(JSON.stringify(kept)).not.toContain("203.0.113.7");
  });

  it("a filled-in hidden field makes no account and counts nothing", async () => {
    from("203.0.113.7");
    const outcome = await signUp({ email: "robot@example.test", signInKey: KEY, website: "http://spam.test" });
    expect(outcome.kind).toBe("refused");
    expect((await engine.query("select 1 from users where email = 'robot@example.test'")).rows).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it("a burst of simultaneous sign-ins lets no more than the limit through", async () => {
    from("203.0.113.7");
    const outcomes = await Promise.all(Array.from({ length: 40 }, () => signIn({ email: "nobody@example.test", signInKey: KEY })));
    expect(outcomes.filter((o) => o.kind === "refused").length).toBe(10);
    expect(isolated.verified).toBe(30);
    expect((await rows()).length).toBe(30);
  });

  it("one connection cannot take every QR slot", async () => {
    await tried("203.0.113.7", "qr", 20);
    from("203.0.113.7");
    expect((await createQrSignIn()).kind).toBe("busy");
    from("198.51.100.2");
    expect((await createQrSignIn()).kind).toBe("created");
  });

  it("with no address to go by, nothing is limited per connection", async () => {
    from(null);
    expect((await signUp({ email: "home@example.test", signInKey: KEY })).kind).toBe("ok");
    expect(await rows()).toEqual([]);
  });
});
