import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { commitImport } from "../imports";
import { importBrokerStatement, previewBrokerStatement } from "../brokerImport";
import { createConnection } from "../connections";

let engine: PGlite;
const rows = [{ date: "2026-11-01", amount: -10, description: "synthetic" }];
const statement = "Date,Type,Amount,Currency\n2026-11-01,Deposit,1,EUR\n";
beforeAll(async () => {
  engine = new PGlite(); isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await engine.exec("CREATE ROLE import_security_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO import_security_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO import_security_test;");
}, 60000);
afterAll(async () => { await engine?.close(); });
beforeEach(async () => {
  await engine.exec(`RESET ROLE; DROP TRIGGER IF EXISTS reject_synthetic_import ON transactions; DROP FUNCTION IF EXISTS reject_synthetic_import();
    DELETE FROM users; INSERT INTO users(id) VALUES('import-me'),('import-other');
    SET ROLE import_security_test; SELECT set_config('app.user_id','import-other',false);`);
  await isolated.db.insert(schema.accounts).values({ id: "other-account", institution: "Synthetic", name: "Other", accountType: "bank", currency: "EUR", balance: "200" });
  await engine.exec("SELECT set_config('app.user_id','import-me',false)");
  await isolated.db.insert(schema.accounts).values({ id: "my-usd-account", institution: "Synthetic", name: "Own", accountType: "bank", currency: "USD", balance: "100" });
});

describe("imports enforce owned parents and commit atomically", () => {
  it("cannot attach a bank import to another person's account", async () => {
    await expect(commitImport("other-account", "synthetic.csv", rows, "{}", false)).rejects.toThrow("Account not found");
    expect(await isolated.db.select().from(schema.imports)).toEqual([]);
    expect(await isolated.db.select().from(schema.transactions)).toEqual([]);
  });
  it("uses the account's own currency when recording its movements", async () => {
    await commitImport("my-usd-account", "synthetic.csv", rows, "{}", true);
    const [movement] = await isolated.db.select().from(schema.transactions);
    const [account] = await isolated.db.select().from(schema.accounts).where(eq(schema.accounts.id, "my-usd-account"));
    expect(movement.currency).toBe("USD");
    expect(Number(movement.amount)).toBe(-10);
    expect(Number(account.balance)).toBe(90);
  });
  it("rolls back the import record and earlier movements if a later insert fails", async () => {
    await engine.exec(`RESET ROLE; CREATE FUNCTION reject_synthetic_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.description = 'synthetic failure' THEN RAISE EXCEPTION 'synthetic import failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_synthetic_import BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION reject_synthetic_import(); SET ROLE import_security_test;`);
    await expect(commitImport("my-usd-account", "synthetic.csv", [...rows, { ...rows[0], description: "synthetic failure" }], "{}", true)).rejects.toThrow();
    expect(await isolated.db.select().from(schema.imports)).toEqual([]);
    expect(await isolated.db.select().from(schema.transactions)).toEqual([]);
    expect(await isolated.db.select().from(schema.auditLog)).toEqual([]);
    const [account] = await isolated.db.select().from(schema.accounts).where(eq(schema.accounts.id, "my-usd-account"));
    expect(Number(account.balance)).toBe(100);
  });
  it("cannot preview a broker statement against another person's account", async () => {
    await expect(previewBrokerStatement(statement, "other-account")).rejects.toThrow("Account not found");
  });
  it("cannot attach broker events to another person's account", async () => {
    const form = new FormData(); form.set("accountId", "other-account"); form.set("statement", statement);
    await expect(importBrokerStatement(form)).rejects.toThrow("Account not found");
    expect(await isolated.db.select().from(schema.brokerEvents)).toEqual([]);
  });
  it("keeps a valid broker import working", async () => {
    const form = new FormData(); form.set("accountId", "my-usd-account"); form.set("statement", statement);
    expect(await importBrokerStatement(form)).toMatchObject({ imported: 1, rejected: 0 });
    expect(await isolated.db.select().from(schema.brokerEvents)).toHaveLength(1);
  });
  it("cannot attach a broker connection to another person's account", async () => {
    const form = new FormData(); form.set("accountId", "other-account"); form.set("platform", "hyperliquid"); form.set("externalId", `0x${"a".repeat(40)}`);
    await expect(createConnection(form)).rejects.toThrow("Account not found");
    expect(await isolated.db.select().from(schema.accountConnections)).toEqual([]);
  });
  it("keeps an owned public-wallet connection working without contacting a broker", async () => {
    const remote = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No provider calls allowed"));
    try {
      const form = new FormData(); form.set("accountId", "my-usd-account"); form.set("platform", "hyperliquid"); form.set("externalId", `0x${"a".repeat(40)}`);
      await createConnection(form);
      const [connection] = await isolated.db.select().from(schema.accountConnections);
      expect(connection.accountId).toBe("my-usd-account");
      expect(remote).not.toHaveBeenCalled();
    } finally { remote.mockRestore(); }
  });
});
