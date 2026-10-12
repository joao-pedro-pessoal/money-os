import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// No .env, production client, network or persisted data in this rehearsal.
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { exportAllData, restoreBackup } from "../export";

let engine: PGlite;
const as = (id: string) => engine.query("select set_config('app.user_id', $1, false)", [id]);
const restore = (json: string) => {
  const form = new FormData(); form.set("backup", json); form.set("confirmation", "RESTORE");
  return restoreBackup(form);
};

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "tester-a" }, { id: "tester-b" }]);
  await engine.exec(`
    CREATE ROLE moneyos_restore_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO moneyos_restore_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moneyos_restore_test;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO moneyos_restore_test;
    SET ROLE moneyos_restore_test;
  `);
  for (const id of ["tester-a", "tester-b"]) {
    await as(id);
    await isolated.db.insert(schema.accounts).values({ id: `account-${id}`, name: id, institution: "Synthetic", accountType: "bank", balance: "100" });
    await isolated.db.insert(schema.liabilities).values({ id: `debt-${id}`, name: "Synthetic debt", balance: "10", accountId: `account-${id}` });
    await isolated.db.insert(schema.expectedMoney).values({ id: `expected-${id}`, name: "Synthetic income", amount: "20", accountId: `account-${id}` });
    await isolated.db.insert(schema.subscriptions).values({ id: `subscription-${id}`, name: "Synthetic subscription", amount: "5" });
    await isolated.db.insert(schema.transactions).values({ id: `transaction-${id}`, accountId: `account-${id}`, date: new Date("2026-10-01"), amount: "5", type: "expense" });
    await isolated.db.insert(schema.subscriptionCharges).values({ subscriptionId: `subscription-${id}`, transactionId: `transaction-${id}`, dueOn: "2026-10-01", status: "recorded" });
  }
  await as("tester-a");
}, 60_000);
afterAll(async () => { await engine?.close(); });

describe("restore rehearsal on isolated PostgreSQL with the real migrations and RLS", () => {
  it("round-trips owned rows and references without changing the second account", async () => {
    await as("tester-b"); const other = JSON.parse(await exportAllData()).data;
    await as("tester-a"); const original = await exportAllData();
    expect(original).not.toContain("tester-b");
    await isolated.db.update(schema.accounts).set({ balance: "50" }).where(eq(schema.accounts.id, "account-tester-a"));
    await restore(original);
    expect(JSON.parse(await exportAllData()).data).toEqual(JSON.parse(original).data);
    await as("tester-b"); expect(JSON.parse(await exportAllData()).data).toEqual(other);
    await as("tester-a");
  });

  it("rolls back all deletions when PostgreSQL rejects a backup row", async () => {
    const original = await exportAllData();
    const broken = JSON.parse(original); broken.data.accounts[0].balance = "not-a-number";
    await expect(restore(JSON.stringify(broken))).rejects.toThrow();
    expect(JSON.parse(await exportAllData()).data).toEqual(JSON.parse(original).data);
  });

  it("ignores an owner written into the file: the rows stay with whoever restores", async () => {
    const original = await exportAllData();
    const forged = JSON.parse(original); forged.data.accounts[0].userId = "tester-b";
    await restore(JSON.stringify(forged));
    expect(JSON.parse(await exportAllData()).data).toEqual(JSON.parse(original).data);
    await as("tester-b");
    expect((await isolated.db.select().from(schema.accounts)).map((row) => row.id)).toEqual(["account-tester-b"]);
    await as("tester-a");
  });

  it("restores into an account deleted and made again, which has a new id", async () => {
    const original = await exportAllData();
    await engine.exec(`RESET ROLE; DELETE FROM users WHERE id = 'tester-a'; INSERT INTO users (id) VALUES ('tester-c'); SET ROLE moneyos_restore_test;`);
    await as("tester-c");
    expect(JSON.parse(await exportAllData()).data.accounts).toEqual([]);
    await restore(original);
    const owners = (rows: { userId?: string }[]) => [...new Set(rows.map((r) => r.userId))];
    const restored = JSON.parse(await exportAllData()).data;
    expect(owners(restored.accounts)).toEqual(["tester-c"]);
    expect(owners(restored.transactions)).toEqual(["tester-c"]);
    const strip = (data: Record<string, Record<string, unknown>[]>) =>
      Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, rows.map((r) => { const copy = { ...r }; delete copy.userId; return copy; })]));
    expect(strip(restored)).toEqual(strip(JSON.parse(original).data));
    await as("tester-b");
    expect((await isolated.db.select().from(schema.accounts)).map((row) => row.id)).toEqual(["account-tester-b"]);
  });
});
