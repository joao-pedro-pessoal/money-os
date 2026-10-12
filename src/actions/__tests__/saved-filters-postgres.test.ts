import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

// The real migrations and row security, on an isolated in-memory PostgreSQL.
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { deleteSavedFilters, listAnalysisViews, listSavedFilters, saveAnalysisView, saveFilters } from "../savedViews";

let engine: PGlite;
const as = (id: string) => engine.query("select set_config('app.user_id', $1, false)", [id]);

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "person-a" }, { id: "person-b" }]);
  await engine.exec(`
    CREATE ROLE moneyos_filters_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO moneyos_filters_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moneyos_filters_test;
    SET ROLE moneyos_filters_test;
  `);
}, 60_000);
afterAll(async () => { await engine?.close(); });

describe("saved filters in PostgreSQL, with the real migrations and row security", () => {
  it("keep each screen's and each person's apart, and the same name again replaces it", async () => {
    await as("person-a");
    await saveFilters("trade-history", "Crypto longs", JSON.stringify({ assetTypes: ["crypto"] }));
    await saveFilters("trade-history", "Crypto longs", JSON.stringify({ assetTypes: ["crypto"], directions: ["long"] }));
    await saveFilters("transactions", "Big ones", JSON.stringify({ minAmount: 500 }));
    await as("person-b");
    expect(await listSavedFilters("trade-history")).toEqual([]);
    await as("person-a");
    const trades = await listSavedFilters("trade-history");
    expect(trades.map((s) => [s.name, JSON.parse(s.config)])).toEqual([["Crypto longs", { assetTypes: ["crypto"], directions: ["long"] }]]);
    expect((await listSavedFilters("transactions")).map((s) => s.name)).toEqual(["Big ones"]);
  });

  it("refuse an unknown screen, a blank name, or what is not JSON", async () => {
    await as("person-a");
    await expect(saveFilters("settings", "x", "{}")).rejects.toThrow("Unknown screen.");
    await expect(saveFilters("transactions", "   ", "{}")).rejects.toThrow("Give the filters a name.");
    await expect(saveFilters("transactions", "x", "{nope")).rejects.toThrow("could not be saved");
    await expect(saveFilters("transactions", 5 as never, "{}")).rejects.toThrow("could not be saved");
  });

  it("delete only your own", async () => {
    await as("person-a");
    const [mine] = await listSavedFilters("transactions");
    await as("person-b");
    await deleteSavedFilters(mine.id);
    await as("person-a");
    expect(await listSavedFilters("transactions")).toHaveLength(1);
    await deleteSavedFilters(mine.id);
    expect(await listSavedFilters("transactions")).toEqual([]);
  });

  it("an Analysis view keeps its second grouping and filters", async () => {
    await as("person-a");
    const form = new FormData();
    form.set("name", "Core by risk");
    form.set("query", "groupBy=playlist&then=riskLevel&f_playlist=Core&f_assetType=etf&f_assetType=crypto");
    await saveAnalysisView(form);
    const [view] = await listAnalysisViews();
    expect(view.query).toBe("groupBy=playlist&then=riskLevel&f_assetType=crypto&f_assetType=etf&f_playlist=Core");
    // Saved filters for other screens are not Analysis views.
    expect((await listAnalysisViews()).map((v) => v.name)).toEqual(["Core by risk"]);
  });

  it("an Analysis view from a page loaded before still saves from its separate fields", async () => {
    await as("person-b");
    const form = new FormData();
    form.set("name", "Old page");
    for (const [k, v] of Object.entries({ groupBy: "riskLevel", sort: "value", dir: "desc", synced: "on", status: "open" })) form.set(k, v);
    await saveAnalysisView(form);
    expect((await listAnalysisViews()).map((v) => v.query)).toEqual(["groupBy=riskLevel&sort=value&dir=desc&synced=on&status=open"]);
  });
});
