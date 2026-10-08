import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { recoveryHashOf } from "@/lib/accounts/credentials";

const fake = vi.hoisted(() => ({
  recoveryHash: "", passwordHash: "old", cookie: vi.fn(),
  release: null as (() => void) | null,
  hashing: 0,
}));

vi.mock("@/db/client", () => ({
  asUser: async (_id: string, work: () => Promise<void>) => work(),
  db: {
    select: () => ({ from: () => ({ where: async () => [{
      id: "test-person", recoveryHash: fake.recoveryHash, passwordHash: fake.passwordHash,
      failedLogins: 0, lockedUntil: null,
    }] }) }),
    update: () => ({ set: (values: { recoveryHash: string; passwordHash: string }) => ({ where: (condition: SQL) => {
      // Model the atomic WHERE against the current row, using the action's
      // actual Drizzle predicate, not a second implementation of the guard.
      const query = new PgDialect().sqlToQuery(condition);
      const guarded = query.sql.includes('"recovery_hash"');
      const matches = !guarded || query.params.includes(fake.recoveryHash);
      if (matches) Object.assign(fake, values);
      const result = Promise.resolve(matches ? [{ id: "test-person", failedLogins: 1 }] : []);
      return Object.assign(result, { returning: () => result });
    } }) }),
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: fake.cookie }) }));
vi.mock("../session", () => ({ currentUserId: async () => "test-person" }));
vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE_NAME: "session", newSessionValue: async () => "signed",
  sessionCookieOptions: () => ({}), ownerPassword: () => "unused",
}));
vi.mock("@/lib/accounts/password", () => ({
  PASSWORD_MAX: 1024, needsRehash: () => false, verifyPassword: async () => true,
  hashPassword: async (key: string) => {
    fake.hashing++;
    if (fake.hashing === 1) await new Promise<void>((resolve) => { fake.release = resolve; });
    else fake.release!();
    return `hash:${key}`;
  },
}));

import { recoverAccount } from "../auth";

describe("a recovery code is consumed atomically", () => {
  const code = "abcde-fghjk-mnpqr-stuvw";
  beforeEach(() => {
    fake.recoveryHash = recoveryHashOf(code);
    fake.passwordHash = "old";
    fake.hashing = 0;
    fake.release = null;
    fake.cookie.mockClear();
  });

  it("allows only one of two simultaneous recoveries to replace the password and issue a session", async () => {
    const results = await Promise.all([
      recoverAccount({ email: "test@example.com", recoveryCode: code, signInKey: "a".repeat(64) }),
      recoverAccount({ email: "test@example.com", recoveryCode: code, signInKey: "b".repeat(64) }),
    ]);
    expect(results.filter((r) => r.kind === "ok")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "wrong")).toHaveLength(1);
    expect(fake.cookie).toHaveBeenCalledTimes(1);
    const winner = results.find((r) => r.kind === "ok")!;
    if (winner.kind === "ok") expect(fake.recoveryHash).toBe(recoveryHashOf(winner.recoveryCode));
    expect(fake.passwordHash).toBe(`hash:${results[0].kind === "ok" ? "a".repeat(64) : "b".repeat(64)}`);
    expect(await recoverAccount({ email: "test@example.com", recoveryCode: code, signInKey: "c".repeat(64) }))
      .toEqual({ kind: "wrong" });
  });
});
