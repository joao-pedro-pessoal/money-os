import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, authenticated: true }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => isolated.authenticated }));
import { privateSnapshot } from "../privateSnapshot";

let engine: PGlite;
const as = (id: string) => engine.query("select set_config('app.user_id', $1, false)", [id]);
beforeAll(async () => {
  engine = new PGlite(); isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "snapshot-a" }, { id: "snapshot-b" }]);
  await engine.exec("CREATE ROLE snapshot_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO snapshot_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO snapshot_test; SET ROLE snapshot_test;");
}, 60000);
beforeEach(async () => {
  isolated.authenticated = true;
  for (const id of ["snapshot-a", "snapshot-b"]) { await as(id); await isolated.db.delete(schema.privateSnapshots); }
  await as("snapshot-a");
});
afterAll(async () => { await engine?.close(); });

describe("private, distributed read snapshots with real migrations and RLS", () => {
  it("reuses a fresh result without recalculating or sharing mutable objects", async () => {
    const calculate = vi.fn(async () => ({ amount: 10, nested: { value: 1 } }));
    const first = await privateSnapshot("widget:v1:money:en", calculate);
    first.value.nested.value = 99;
    const second = await privateSnapshot("widget:v1:money:en", calculate);
    expect(second.value.nested.value).toBe(1); expect(calculate).toHaveBeenCalledTimes(1);
    expect(second.generatedAt).toBe(first.generatedAt);
  });
  it("joins simultaneous requests with one writer and no long-lived transaction", async () => {
    const calculate = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 30)); return { amount: 25 }; });
    const result = await Promise.all(Array.from({ length: 8 }, () => privateSnapshot("widget:v1:money:en", calculate)));
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(result.every(row => row.value.amount === 25)).toBe(true);
  });
  it("recomputes expired results and separates edition/language variants", async () => {
    const calculate = vi.fn(async () => ({ amount: 5 }));
    await privateSnapshot("widget:v1:money:en", calculate);
    await isolated.db.update(schema.privateSnapshots).set({ expiresAt: new Date(1), leaseUntil: new Date(1) });
    await privateSnapshot("widget:v1:money:en", calculate);
    await privateSnapshot("widget:v1:full:en", calculate);
    await privateSnapshot("widget:v1:money:pt", calculate);
    expect(calculate).toHaveBeenCalledTimes(4);
  });
  it("never returns another person's cache, even with the exact same key", async () => {
    await privateSnapshot("alerts:v1:money", async () => ({ title: "Only A" }));
    await as("snapshot-b");
    const b = await privateSnapshot("alerts:v1:money", async () => ({ title: "Only B" }));
    expect(b.value.title).toBe("Only B");
    const own = await isolated.db.select().from(schema.privateSnapshots);
    expect(own).toHaveLength(1); expect(own[0].payload).not.toContain("Only A");
    await expect(isolated.db.insert(schema.privateSnapshots).values({ userId: "snapshot-a", key: "forged", payload: "forged", expiresAt: new Date(), leaseUntil: new Date() })).rejects.toThrow();
    await as("snapshot-a");
    expect((await privateSnapshot("alerts:v1:money", async () => ({ title: "wrong" }))).value.title).toBe("Only A");
  });
  it("refuses revoked/anonymous reads before using a still-fresh snapshot", async () => {
    await privateSnapshot("alerts:v1:money", async () => ({ secret: "synthetic" }));
    isolated.authenticated = false;
    await expect(privateSnapshot("alerts:v1:money", async () => ({}))).rejects.toThrow("Sign in again");
  });
  it("releases a failed writer so the next request can recover immediately", async () => {
    await expect(privateSnapshot("alerts:v1:money", async () => { throw new Error("synthetic failure"); })).rejects.toThrow("synthetic failure");
    expect((await privateSnapshot("alerts:v1:money", async () => ({ ok: true }))).value).toEqual({ ok: true });
  });
  it("does not let an old writer publish or unlock a newer token", async () => {
    let finish!: () => void;
    let started!: () => void;
    const begun = new Promise<void>(resolve => { started = resolve; });
    const result = privateSnapshot("alerts:v1:money", async () => { started(); await new Promise<void>(resolve => { finish = resolve; }); return { old: true }; });
    const rejected = expect(result).rejects.toThrow("authorization changed");
    await begun;
    await isolated.db.update(schema.privateSnapshots).set({ leaseToken: "new-token", leaseUntil: new Date(Date.now() + 300000) }).where(eq(schema.privateSnapshots.key, "alerts:v1:money"));
    finish(); await rejected;
    expect((await isolated.db.select().from(schema.privateSnapshots))[0].leaseToken).toBe("new-token");
  });
  it("allows a crashed lease to expire and does not cache an oversized result", async () => {
    await isolated.db.insert(schema.privateSnapshots).values({ key: "alerts:v1:money", leaseToken: "crashed", leaseUntil: new Date(1), expiresAt: new Date(1) });
    expect((await privateSnapshot("alerts:v1:money", async () => ({ ok: true }))).value.ok).toBe(true);
    const huge = "x".repeat(1024 * 1024 + 1);
    expect((await privateSnapshot("widget:v1:full:en", async () => ({ huge }))).value.huge).toHaveLength(huge.length);
    expect((await isolated.db.select().from(schema.privateSnapshots).where(eq(schema.privateSnapshots.key, "widget:v1:full:en")))[0].payload).toBeNull();
  });
  it("removes derived financial data when the owning account is deleted", async () => {
    await privateSnapshot("alerts:v1:money", async () => ({ title: "Disposable" }));
    await engine.exec("RESET ROLE; DELETE FROM users WHERE id = 'snapshot-a';");
    try { expect((await isolated.db.select().from(schema.privateSnapshots)).some(row => row.userId === "snapshot-a")).toBe(false); }
    finally { await engine.exec("INSERT INTO users(id) VALUES('snapshot-a'); SET ROLE snapshot_test;"); }
  });
});
