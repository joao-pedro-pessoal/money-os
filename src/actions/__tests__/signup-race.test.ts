import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { users } from "@/db/schema";

const fake = vi.hoisted(() => ({
  counts: { total: 0, lastHour: 0, lastDay: 0 },
  hashing: 0, releaseHash: null as (() => void) | null,
  lock: Promise.resolve(), cookie: vi.fn(),
}));

function select(fields: Record<string, unknown>) {
  return { from: () => {
    const result = Promise.resolve("total" in fields ? [{ ...fake.counts }] : [{ n: 1 }]);
    return Object.assign(result, { where: async () => [] });
  } };
}
function insert(table: unknown) {
  return { values: () => ({
    returning: async () => {
      expect(table).toBe(users);
      fake.counts.total++; fake.counts.lastHour++; fake.counts.lastDay++;
      return [{ id: `new-${fake.counts.total}` }];
    },
    onConflictDoNothing: async () => {},
  }) };
}
vi.mock("@/db/client", () => ({
  asUser: async (_id: string, work: () => Promise<void>) => work(),
  db: { select, insert, transaction: async (work: (tx: unknown) => Promise<unknown>) => {
    let unlock: (() => void) | undefined;
    try {
      return await work({ select, insert, execute: async (statement: SQL) => {
        expect(new PgDialect().sqlToQuery(statement).sql).toContain("pg_advisory_xact_lock");
        const previous = fake.lock;
        fake.lock = new Promise<void>((resolve) => { unlock = resolve; });
        await previous;
      } });
    } finally { unlock?.(); }
  } },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: fake.cookie }) }));
vi.mock("../session", () => ({ currentUserId: async () => null }));
vi.mock("../fx", () => ({ refreshRates: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE_NAME: "session", newSessionValue: async () => "signed",
  sessionCookieOptions: () => ({}), ownerPassword: () => "unused",
}));
vi.mock("@/lib/accounts/password", () => ({
  PASSWORD_MAX: 1024, needsRehash: () => false, verifyPassword: async () => true,
  hashPassword: async () => {
    fake.hashing++;
    if (fake.hashing === 1) await new Promise<void>((resolve) => { fake.releaseHash = resolve; });
    else fake.releaseHash!();
    return "hashed";
  },
}));
import { signUp } from "../auth";

beforeEach(() => {
  fake.hashing = 0; fake.releaseHash = null; fake.lock = Promise.resolve(); fake.cookie.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("registration limits across simultaneous requests", () => {
  it.each([
    { name: "total", limit: "10", total: 9, lastHour: 0, lastDay: 0 },
    { name: "hour", limit: "100", total: 9, lastHour: 4, lastDay: 4 },
    { name: "day", limit: "100", total: 30, lastHour: 0, lastDay: 19 },
  ])("allows only the last available place at the $name limit", async ({ limit, total, lastHour, lastDay }) => {
    vi.stubEnv("MAX_ACCOUNTS", limit);
    fake.counts = { total, lastHour, lastDay };
    const results = await Promise.all([
      signUp({ email: "first@example.com", signInKey: "a".repeat(64) }),
      signUp({ email: "second@example.com", signInKey: "b".repeat(64) }),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["ok", "refused"]);
    expect(fake.counts.total).toBe(total + 1);
    expect(fake.cookie).toHaveBeenCalledTimes(1);
  });
});
