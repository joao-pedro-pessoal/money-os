import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { endedBy, readSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recoveryHashOf } from "@/lib/accounts/credentials";

const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>,
  verifyRace: null as (() => Promise<void>) | null, hashRace: null as (() => Promise<void>) | null,
  sessionRace: null as (() => Promise<void>) | null, jar: new Map<string, string>(), rehash: false,
}));
vi.mock("@/db/client", async () => {
  const { asUser } = await vi.importActual<typeof import("@/db/acting")>("@/db/acting");
  return { get db() { return isolated.db; }, asUser: async (id: string, work: () => Promise<void>) => {
    const race = isolated.sessionRace; isolated.sessionRace = null; await race?.();
    return asUser(id, work);
  } };
});
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => isolated.jar.has(key) ? { value: isolated.jar.get(key) } : undefined,
  set: (key: string, value: string) => isolated.jar.set(key, value), delete: (key: string) => isolated.jar.delete(key),
}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ currentUserId: async () => "raceperson", hasSession: async () => true }));
vi.mock("../attemptGate", () => ({ admitted: async () => true }));
vi.mock("@/lib/accounts/password", () => ({ PASSWORD_MAX: 512, needsRehash: () => isolated.rehash,
  verifyPassword: async () => { const race = isolated.verifyRace; isolated.verifyRace = null; await race?.(); return true; },
  hashPassword: async () => { const race = isolated.hashRace; isolated.hashRace = null; await race?.(); return "synthetic-renewed-hash"; },
}));
import { deleteAccount, recoverAccount, replaceRecoveryCode, signIn } from "../auth";

let engine: PGlite;
const code = "abcde-fghjk-mnpqr-stuvw";
const key = "a".repeat(64);
const person = async () => (await isolated.db.select().from(schema.users).where(eq(schema.users.id, "raceperson")))[0];
const recoverDuringCheck = async () => {
  await isolated.db.update(schema.users).set({ passwordHash: "synthetic-recovered-hash", recoveryHash: "b".repeat(64), sessionsNotBefore: new Date("2026-11-11T12:00:00.900Z") }).where(eq(schema.users.id, "raceperson"));
};
beforeAll(async () => {
  engine = new PGlite(); isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
}, 60000);
afterAll(async () => { await engine?.close(); });
beforeEach(async () => {
  await isolated.db.delete(schema.users);
  await isolated.db.insert(schema.users).values([
    { id: "owner", email: "owner@example.invalid", passwordHash: "synthetic-owner-hash" },
    { id: "raceperson", email: "person@example.invalid", passwordHash: "synthetic-old-hash", recoveryHash: recoveryHashOf(code) },
  ]);
  await engine.exec("select set_config('app.user_id','raceperson',false)");
  await isolated.db.insert(schema.categories).values({ name: "Synthetic", kind: "income" });
  await isolated.db.insert(schema.exchangeRates).values({ quote: "EUR", rate: "1" });
  isolated.verifyRace = null; isolated.hashRace = null; isolated.sessionRace = null; isolated.rehash = false; isolated.jar.clear();
  vi.stubEnv("APP_SECRET", "synthetic-secret-for-auth-races");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("recovery cannot be undone by an earlier password verification", () => {
  it("keeps an ordinary sign-in working", async () => {
    expect(await signIn({ email: "person@example.invalid", signInKey: key })).toMatchObject({ kind: "ok" });
    expect((await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).valid).toBe(true);
  });
  it("keeps a verified recovery-code replacement working", async () => {
    const result = await replaceRecoveryCode({ signInKey: key });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect((await person()).recoveryHash).toBe(recoveryHashOf(result.recoveryCode));
  });
  it("keeps a verified account deletion working", async () => {
    expect(await deleteAccount({ signInKey: key, confirmEmail: "person@example.invalid" })).toEqual({ kind: "deleted" });
    expect(await person()).toBeUndefined();
  });
  it("does not let a stale sign-in overwrite the recovered password through rehash", async () => {
    isolated.rehash = true; isolated.verifyRace = recoverDuringCheck;
    expect(await signIn({ email: "person@example.invalid", signInKey: key })).toMatchObject({ kind: "wrong" });
    expect((await person()).passwordHash).toBe("synthetic-recovered-hash");
    expect(isolated.jar.has(SESSION_COOKIE_NAME)).toBe(false);
  });
  it("keeps a sign-in begun before revocation older than its cutoff", async () => {
    isolated.sessionRace = async () => { await recoverDuringCheck(); vi.setSystemTime(new Date("2026-11-11T12:00:01Z")); };
    await signIn({ email: "person@example.invalid", signInKey: key });
    const value = isolated.jar.get(SESSION_COOKIE_NAME);
    if (value) {
      const session = await readSession(value);
      expect(session.valid).toBe(true);
      if (session.valid) expect(endedBy((await person()).sessionsNotBefore, session.issuedAt)).toBe(true);
    }
  });
  it("does not replace the recovery code after the password changed during verification", async () => {
    isolated.verifyRace = recoverDuringCheck;
    expect(await replaceRecoveryCode({ signInKey: key })).toMatchObject({ kind: "wrong" });
    expect((await person()).recoveryHash).toBe("b".repeat(64));
  });
  it("does not delete an account after its password changed during verification", async () => {
    isolated.verifyRace = recoverDuringCheck;
    expect(await deleteAccount({ signInKey: key, confirmEmail: "person@example.invalid" })).toMatchObject({ kind: "wrong" });
    expect((await person()).passwordHash).toBe("synthetic-recovered-hash");
  });
  it("revokes logins made while the new password hash was being calculated", async () => {
    isolated.hashRace = async () => { vi.setSystemTime(new Date("2026-11-11T12:00:01Z")); };
    expect(await recoverAccount({ email: "person@example.invalid", recoveryCode: code, signInKey: key })).toMatchObject({ kind: "ok" });
    const cutoff = (await person()).sessionsNotBefore;
    expect(endedBy(cutoff, new Date("2026-11-11T12:00:00.500Z"))).toBe(true);
    const session = await readSession(isolated.jar.get(SESSION_COOKIE_NAME));
    expect(session.valid).toBe(true);
    if (session.valid) expect(endedBy(cutoff, session.issuedAt)).toBe(false);
  });
});
