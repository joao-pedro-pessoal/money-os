// These tests isolate data integrity; distributed admission is exercised separately.
vi.mock("@/actions/workGate", () => ({ withWork: async (_kind: string, work: () => Promise<unknown>) => work() }));
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

// The invented account Google Play's reviewers get (docs/play-store): it must
// restore whole into a brand-new account with the current code and schema.
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/session", () => ({ hasSession: async () => true }));
import { exportAllData } from "../export";
import { replaceBackup } from "../backupService";
const restoreBackup = (form: FormData) => replaceBackup(String(form.get("backup")));

const demo = readFileSync("docs/play-store/demo-account-backup.json", "utf8");
let engine: PGlite;
const as = (id: string) => engine.query("select set_config('app.user_id', $1, false)", [id]);

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "reviewer" }, { id: "someone-else" }]);
  await engine.exec(`
    CREATE ROLE play_demo_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO play_demo_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO play_demo_test;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO play_demo_test;
    SET ROLE play_demo_test;
  `);
  await as("someone-else");
  await isolated.db.insert(schema.accounts).values({ id: "other-account", name: "Other person", institution: "Synthetic", accountType: "bank", balance: "50" });
}, 60_000);
afterAll(async () => { await engine?.close(); });

describe("Play Store demo account backup", () => {
  it("holds invented data only: no investments and no real identity", () => {
    const parsed = JSON.parse(demo) as { data: Record<string, unknown[]> };
    expect(parsed.data.holdings ?? []).toHaveLength(0);
    expect(parsed.data.accountConnections ?? []).toHaveLength(0);
    expect(new Set(demo.match(/"userId": "[^"]*"/g))).toEqual(new Set(['"userId": "alex"']));
    expect(demo).not.toMatch(/@(gmail|hotmail|outlook|isep)\./i);
  });

  it("restores whole into a new account and touches nobody else's", async () => {
    await as("reviewer");
    const form = new FormData(); form.set("backup", demo); form.set("confirmation", "RESTORE");
    await restoreBackup(form);
    const expected = (JSON.parse(demo) as { data: Record<string, unknown[]> }).data;
    const restored = JSON.parse(await exportAllData()).data as Record<string, unknown[]>;
    for (const table of ["accounts", "transactions", "budgets", "buckets", "subscriptions", "expectedMoney", "liabilities"]) {
      expect(restored[table]?.length, table).toBe(expected[table]?.length);
    }
    await as("someone-else");
    const theirs = await isolated.db.select().from(schema.accounts);
    expect(theirs.map((a) => a.id)).toEqual(["other-account"]);
  });
});
