import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { SQL } from "drizzle-orm";
import * as schema from "@/db/schema";
import { endedBy, newSessionValue, readSession } from "@/lib/auth";

const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, race: null as (() => Promise<void>) | null, cookie: "", written: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {
  select: () => ({ from: () => ({ where: async (condition: SQL) => {
    const rows = await isolated.db.select({ notBefore: schema.users.sessionsNotBefore }).from(schema.users).where(condition);
    const race = isolated.race; isolated.race = null; await race?.();
    return rows;
  } }) }),
  update: () => isolated.db.update(schema.users),
} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: isolated.cookie }), set: isolated.written }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { logOutOtherDevices } from "../session";

let engine: PGlite;
beforeAll(async () => { engine = new PGlite(); isolated.db = drizzle(engine, { schema }); await migrate(isolated.db, { migrationsFolder: "./drizzle" }); }, 60000);
afterAll(async () => { await engine?.close(); });
beforeEach(async () => {
  await isolated.db.delete(schema.users);
  await isolated.db.insert(schema.users).values({ id: "sessionperson", passwordHash: "synthetic-old" });
  vi.stubEnv("APP_SECRET", "synthetic-secret-for-logout-race");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-11T12:00:01Z"));
  isolated.cookie = await newSessionValue("sessionperson", new Date("2026-11-11T12:00:00Z"));
  isolated.race = null; isolated.written.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("logging out other devices cannot mint a session after concurrent recovery", () => {
  it("refuses the revocation write if recovery ended the initiating session", async () => {
    const cutoff = new Date("2026-11-11T12:00:00.900Z");
    isolated.race = async () => { await isolated.db.update(schema.users).set({ passwordHash: "synthetic-recovered", sessionsNotBefore: cutoff }); };
    await expect(logOutOtherDevices()).rejects.toThrow("Sign in again.");
    expect(isolated.written).not.toHaveBeenCalled();
    const [person] = await isolated.db.select().from(schema.users);
    expect(person.sessionsNotBefore).toEqual(cutoff);
  });
  it("still ends old devices and signs the initiating device in normally", async () => {
    await logOutOtherDevices();
    expect(isolated.written).toHaveBeenCalledOnce();
    const value = isolated.written.mock.calls[0][1] as string;
    const fresh = await readSession(value);
    const old = await readSession(isolated.cookie);
    const [person] = await isolated.db.select().from(schema.users);
    expect(fresh.valid).toBe(true); expect(old.valid).toBe(true);
    if (fresh.valid) expect(endedBy(person.sessionsNotBefore, fresh.issuedAt)).toBe(false);
    if (old.valid) expect(endedBy(person.sessionsNotBefore, old.issuedAt)).toBe(true);
  });
});
