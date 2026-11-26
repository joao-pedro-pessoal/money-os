import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
const fixture = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, user: "history-a" }));
vi.mock("@/db/client", () => ({ get db() { return fixture.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => true, currentUserId: async () => fixture.user }));
vi.mock("@/actions/releaseEdition", () => ({ currentInvestments: async () => false }));
vi.mock("@/actions/language", () => ({ currentLanguage: async () => "en" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { GET } from "@/app/api/widget/route";
let engine: PGlite;
const as = async (id: string) => { fixture.user = id; await engine.query("select set_config('app.user_id', $1, false)", [id]); };
beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-recorded-history-secret");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External network disabled in history fixture"); }));
  engine = new PGlite(); fixture.db = drizzle(engine, { schema }); await migrate(fixture.db, { migrationsFolder: "./drizzle" });
  await fixture.db.insert(schema.users).values([{ id: "history-a" }, { id: "history-b" }]);
  await engine.exec("CREATE ROLE history_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO history_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO history_test; SET ROLE history_test;");
  await as("history-a");
  await fixture.db.insert(schema.accounts).values({ id: "history-account", name: "Synthetic", institution: "Synthetic", accountType: "bank", currency: "EUR", balance: "1000" });
  await fixture.db.insert(schema.liabilities).values({ name: "Synthetic separate debt", balance: "250", currency: "EUR" });
  await fixture.db.insert(schema.accountSnapshots).values([
    { accountId: "history-account", balance: "800", currency: "EUR", baseCurrency: "EUR", valueInBase: "800", timestamp: new Date("2026-10-01T12:00:00Z") },
    { accountId: "history-account", balance: "1200", currency: "EUR", baseCurrency: "EUR", valueInBase: "1200", timestamp: new Date("2026-10-02T12:00:00Z") },
  ]);
}, 60_000);
afterAll(async () => { await engine?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("live net worth and recorded asset history through the real widget endpoint", () => {
  it("keeps today's debt-adjusted total distinct from the historical value and change", async () => {
    const response = await GET(); expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.netWorth).toBe(750);
    expect(payload.history).toEqual({ basis: "recorded-assets", latestValue: 1200, change: 400, latestDate: "2026-10-02" });
    expect(payload.series.map((point: { value: number }) => point.value)).toEqual([800, 1200]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not reuse another person's history and reports missing history as absent", async () => {
    await as("history-b");
    const response = await GET(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ netWorth: 0, series: [], history: { basis: "recorded-assets", latestValue: null, change: null } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
