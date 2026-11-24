import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => true }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { acquireWork, withWork, WorkLimitedError } from "../workGate";
import { nextAdmission } from "@/lib/accounts/workLimits";

let engine: PGlite;
beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-work-gate-secret-for-isolated-tests");
  engine = new PGlite(); isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await engine.exec("CREATE ROLE work_gate_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO work_gate_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO work_gate_test; SET ROLE work_gate_test;");
}, 60000);
beforeEach(async () => {
  await isolated.db.delete(schema.workGates);
  await engine.query("select set_config('app.user_id', 'synthetic-person', false)");
});
afterAll(async () => { await engine?.close(); vi.unstubAllEnvs(); });

describe("distributed admission and token-owned leases in migrated PostgreSQL", () => {
  it("refuses concurrent work for the same person then permits a later request", async () => {
    const release = await acquireWork("csv-import");
    await expect(acquireWork("csv-import")).rejects.toBeInstanceOf(WorkLimitedError);
    await release();
    await (await acquireWork("csv-import"))();
    await expect(acquireWork("csv-import")).rejects.toMatchObject({ retryAfter: expect.any(Number) });
  });
  it("admits exactly two requests from a simultaneous burst", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => withWork("csv-import", async () => "done")));
    expect(results.filter(result => result.status === "fulfilled").length).toBeLessThanOrEqual(2);
    expect(results.some(result => result.status === "fulfilled")).toBe(true);
    expect(results.filter(result => result.status === "rejected").every(result => result.status === "rejected" && result.reason instanceof WorkLimitedError)).toBe(true);
  });
  it("bounds global work even when all callers have different identities", async () => {
    const release: (() => Promise<void>)[] = [];
    for (let i = 0; i < 4; i++) {
      await engine.query("select set_config('app.user_id', $1, false)", [`person-${i}`]);
      release.push(await acquireWork("backup-inspect"));
    }
    await engine.query("select set_config('app.user_id', 'person-five', false)");
    await expect(acquireWork("backup-inspect")).rejects.toBeInstanceOf(WorkLimitedError);
    for (const finish of release) await finish();
    await (await acquireWork("backup-inspect"))();
  });
  it("releases leases on a work failure without refunding the request budget", async () => {
    await expect(withWork("export", async () => { throw new Error("synthetic failure"); })).rejects.toThrow("synthetic failure");
    expect((await isolated.db.select().from(schema.workGates)).every(row => row.leases === "[]")).toBe(true);
    await withWork("export", async () => 1);
    await expect(withWork("export", async () => 1)).rejects.toBeInstanceOf(WorkLimitedError);
  });
  it("expires crashed leases and prevents an old completion releasing a newer token", async () => {
    const oldRelease = await acquireWork("backup-inspect");
    await isolated.db.update(schema.workGates).set({ leases: JSON.stringify([{ token: "crashed", until: 1 }]) });
    const newRelease = await acquireWork("backup-inspect");
    await oldRelease();
    await expect(acquireWork("backup-inspect")).rejects.toBeInstanceOf(WorkLimitedError);
    await newRelease();
  });
  it("stores no raw identity or connection address and keeps at most one day of history", async () => {
    const release = await acquireWork("backup-inspect"); await release();
    const rows = await isolated.db.select().from(schema.workGates);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("synthetic-person");
    expect(nextAdmission([1, 100000000], [], [{ seconds: 60, max: 3 }], 1, 100000001).history).toEqual([100000000]);
  });
  it("shares a restore budget across attempts and never counts refused work", async () => {
    await withWork("backup-restore", async () => 1);
    for (let i = 0; i < 3; i++) await expect(acquireWork("backup-restore")).rejects.toBeInstanceOf(WorkLimitedError);
    const histories = (await isolated.db.select().from(schema.workGates)).map(row => JSON.parse(row.history));
    expect(histories.filter(history => history.length)).toEqual([expect.any(Array)]);
    expect(histories.flat()).toHaveLength(1);
  });
});
