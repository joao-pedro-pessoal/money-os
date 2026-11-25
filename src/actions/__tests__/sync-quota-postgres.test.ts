import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
const fixture = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, authenticated: true, provider: vi.fn() }));
vi.mock("@/db/client", () => ({ get db() { return fixture.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => fixture.authenticated }));
vi.mock("@/actions/releaseEdition", () => ({ requireInvestments: async () => (await import("../requestSession")).requireServerSession() }));
vi.mock("@/actions/language", () => ({ currentLanguage: async () => "pt" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/connectors/hyperliquid", () => ({ createHyperliquidConnector: () => ({ getAccountState: fixture.provider }) }));
import { syncConnection, syncAllConnections } from "../connections";
import { acquireWork } from "../workGate";
let engine: PGlite;
beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-sync-quota-secret");
  engine = new PGlite(); fixture.db = drizzle(engine, { schema }); await migrate(fixture.db, { migrationsFolder: "./drizzle" });
  await fixture.db.insert(schema.users).values([{ id: "sync-a" }, { id: "sync-b" }]);
  await engine.exec("CREATE ROLE sync_bound_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO sync_bound_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO sync_bound_test; SET ROLE sync_bound_test; SELECT set_config('app.user_id', 'sync-a', false);");
  await fixture.db.insert(schema.accounts).values({ id: "sync-account", name: "Disposable", institution: "Synthetic", accountType: "exchange" });
}, 60_000);
beforeEach(async () => {
  fixture.authenticated = true; fixture.provider.mockReset().mockRejectedValue(new Error("Synthetic provider unavailable"));
  await engine.query("select set_config('app.user_id', 'sync-a', false)");
  await fixture.db.delete(schema.workGates); await fixture.db.delete(schema.accountConnections);
  await fixture.db.insert(schema.accountConnections).values({ id: "sync-connection", accountId: "sync-account", platform: "hyperliquid", externalId: "synthetic-public-id" });
});
afterAll(async () => { await engine?.close(); vi.unstubAllEnvs(); });

describe("connection synchronization admission with real PostgreSQL", () => {
  it("blocks another manual or scheduled call before the connector and without a false failure log", async () => {
    const release = await acquireWork("connection-sync");
    try {
      for (const trigger of ["manual", "scheduled"] as const) expect(await syncConnection("sync-connection", trigger)).toMatchObject({ ok: false, retryAfter: expect.any(Number), error: expect.stringContaining("Demasiados") });
      expect(fixture.provider).not.toHaveBeenCalled(); expect(await fixture.db.select().from(schema.syncLogs)).toEqual([]);
      expect((await fixture.db.select().from(schema.accountConnections))[0].lastSyncStatus).toBeNull();
    } finally { await release(); }
  });
  it("does not allow trigger=scheduled to skip the per-person window", async () => {
    for (let i = 0; i < 10; i++) { const release = await acquireWork("connection-sync"); await release(); }
    expect(await syncConnection("sync-connection", "scheduled")).toMatchObject({ ok: false, retryAfter: expect.any(Number) });
    expect(fixture.provider).not.toHaveBeenCalled();
  });
  it("refuses a second live sync, then releases its slot on provider failure", async () => {
    let started!: () => void, finish!: () => void;
    const begun = new Promise<void>(resolve => { started = resolve; });
    fixture.provider.mockImplementationOnce(async () => { started(); await new Promise<void>(resolve => { finish = resolve; }); throw new Error("Synthetic provider unavailable"); });
    const first = syncConnection("sync-connection"); await begun;
    expect(await syncConnection("sync-connection")).toMatchObject({ ok: false, retryAfter: expect.any(Number) });
    finish(); expect((await first).ok).toBe(false);
    expect(await fixture.db.select().from(schema.syncLogs)).toHaveLength(1);
    expect((await syncConnection("sync-connection")).ok).toBe(false);
    expect(fixture.provider).toHaveBeenCalledTimes(2);
  });
  it("cannot sync another person's connection by guessing its identifier", async () => {
    await engine.query("select set_config('app.user_id', 'sync-b', false)");
    await expect(syncConnection("sync-connection")).rejects.toThrow("Connection not found");
    expect(fixture.provider).not.toHaveBeenCalled();
  });
  it("limits batches before provider work and caps the number of active connections", async () => {
    const release = await acquireWork("sync-batch");
    try { await expect(syncAllConnections()).rejects.toThrow("Too many"); expect(fixture.provider).not.toHaveBeenCalled(); }
    finally { await release(); }
    await fixture.db.insert(schema.accountConnections).values(Array.from({ length: 20 }, (_, i) => ({ accountId: "sync-account", platform: "hyperliquid", externalId: `synthetic-${i}` })));
    await expect(syncAllConnections()).rejects.toThrow("demasiadas ligações"); expect(fixture.provider).not.toHaveBeenCalled();
  });
  it("refuses anonymous syncs before touching a provider or quota", async () => {
    fixture.authenticated = false;
    await expect(syncConnection("sync-connection")).rejects.toThrow("Sign in again"); await expect(syncAllConnections()).rejects.toThrow("Sign in again");
    expect(await fixture.db.select().from(schema.workGates)).toEqual([]); expect(fixture.provider).not.toHaveBeenCalled();
  });
});
