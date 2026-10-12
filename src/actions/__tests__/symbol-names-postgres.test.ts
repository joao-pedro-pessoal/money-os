import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

// The real migrations and row security, on an isolated in-memory PostgreSQL.
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ hasSession: async () => true }));
vi.mock("../dashboard", () => ({ getPortfolioItems: async () => ({ items: [], baseCurrency: "EUR" }) }));
vi.mock("../investmentActivity", () => ({ getTradeAnalysis: async () => ({ rows: [] }) }));
import { getSymbolNames, setSymbolName } from "../symbolNames";

let engine: PGlite;
const as = (id: string) => engine.query("select set_config('app.user_id', $1, false)", [id]);
const name = (symbol: string, value: string) => {
  const form = new FormData();
  form.set("symbol", symbol);
  form.set("name", value);
  return setSymbolName(form);
};

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "person-a" }, { id: "person-b" }]);
  await engine.exec(`
    CREATE ROLE moneyos_names_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO moneyos_names_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moneyos_names_test;
    SET ROLE moneyos_names_test;
  `);
}, 60_000);
afterAll(async () => { await engine?.close(); });

describe("ticker names in PostgreSQL, with the real migrations and row security", () => {
  it("are kept per person: one person's names never reach another", async () => {
    await as("person-a");
    await name("IGLAl_EQ", "Ouro físico");
    await as("person-b");
    await name("IGLAl_EQ", "Gold");
    const rows = await isolated.db.select().from(schema.symbolNames);
    expect(rows.map((r) => r.name)).toEqual(["Gold"]);
    await as("person-a");
    expect((await isolated.db.select().from(schema.symbolNames)).map((r) => [r.symbol, r.name])).toEqual([["IGLAl_EQ", "Ouro físico"]]);
  });

  it("rename in place, and an empty name forgets it", async () => {
    await as("person-a");
    await name("IGLAl_EQ", "Ouro");
    expect(await isolated.db.select({ name: schema.symbolNames.name }).from(schema.symbolNames)).toEqual([{ name: "Ouro" }]);
    await name("IGLAl_EQ", "  ");
    expect(await isolated.db.select().from(schema.symbolNames)).toEqual([]);
    await as("person-b");
    expect(await isolated.db.select({ name: schema.symbolNames.name }).from(schema.symbolNames)).toEqual([{ name: "Gold" }]);
  });

  it("are read as a map from symbol to name", async () => {
    await as("person-b");
    expect(await getSymbolNames()).toEqual({ IGLAl_EQ: "Gold" });
  });
});
