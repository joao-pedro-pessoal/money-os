// These tests isolate data integrity; distributed admission is exercised separately.
vi.mock("@/actions/workGate", () => ({ withWork: async (_kind: string, work: () => Promise<unknown>) => work() }));
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
import { commitImport, undoImport } from "../imports";
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
  it("validates the entire bank payload before inserting the first row", async () => {
    await expect(commitImport("my-usd-account", "synthetic.csv", [...rows, { ...rows[0], date: "2026-02-31" }], "{}", true)).rejects.toThrow();
    expect(await isolated.db.select().from(schema.transactions)).toEqual([]);
    expect(await isolated.db.select().from(schema.imports)).toEqual([]);
    expect(await isolated.db.select().from(schema.auditLog)).toEqual([]);
  });
  it("returns a saved result on network retry and rejects changed details under the same id", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const first = await commitImport("my-usd-account", "synthetic.csv", rows, "{}", true, undefined, id);
    expect(await commitImport("my-usd-account", "synthetic.csv", rows, "{}", true, undefined, id)).toEqual(first);
    await expect(commitImport("my-usd-account", "synthetic.csv", [{ ...rows[0], amount: -20 }], "{}", true, undefined, id)).rejects.toThrow(/different details/);
    expect(await isolated.db.select().from(schema.transactions)).toHaveLength(1);
    expect(Number((await isolated.db.select().from(schema.accounts))[0].balance)).toBe(90);
  });
  it("rechecks duplicates at commit, even with a different request id or a stale preview", async () => {
    await commitImport("my-usd-account", "synthetic.csv", rows, "{}", true);
    const duplicate = await commitImport("my-usd-account", "other-name.csv", rows, "{}", true);
    expect(duplicate).toMatchObject({ created: 0, net: 0, duplicated: 1 });
    expect(await isolated.db.select().from(schema.transactions)).toHaveLength(1);
    expect(Number((await isolated.db.select().from(schema.accounts))[0].balance)).toBe(90);
  });
  it("undoes atomically once and refuses an old commit retry after undo", async () => {
    const first = await commitImport("my-usd-account", "synthetic.csv", rows, "{}", true);
    const form = new FormData(); form.set("importId", first.importId);
    await undoImport(form); await undoImport(form);
    expect(await isolated.db.select().from(schema.transactions)).toHaveLength(0);
    expect(Number((await isolated.db.select().from(schema.accounts))[0].balance)).toBe(100);
    await expect(commitImport("my-usd-account", "synthetic.csv", rows, "{}", true)).rejects.toThrow(/undone/);
  });
  it("keeps undo deletions and the balance unchanged when the audit write fails", async () => {
    const first = await commitImport("my-usd-account", "synthetic.csv", rows, "{}", true);
    await engine.exec(`RESET ROLE; CREATE FUNCTION reject_synthetic_undo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'csv_import_undone' THEN RAISE EXCEPTION 'synthetic undo failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_synthetic_undo BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_synthetic_undo(); SET ROLE import_security_test;`);
    try {
      const form = new FormData(); form.set("importId", first.importId);
      await expect(undoImport(form)).rejects.toThrow();
      expect(await isolated.db.select().from(schema.transactions)).toHaveLength(1);
      expect(await isolated.db.select().from(schema.imports)).toHaveLength(1);
      expect(Number((await isolated.db.select().from(schema.accounts))[0].balance)).toBe(90);
    } finally { await engine.exec("RESET ROLE; DROP TRIGGER reject_synthetic_undo ON audit_log; DROP FUNCTION reject_synthetic_undo(); SET ROLE import_security_test;"); }
  });
  it("adds exact cents and keeps a historical import from changing the balance by default", async () => {
    const result = await commitImport("my-usd-account", "synthetic.csv", [{ ...rows[0], amount: 0.1 }, { ...rows[0], description: "second", amount: 0.2 }], "{}");
    expect(result.net).toBe(0.3);
    expect(Number((await isolated.db.select().from(schema.accounts))[0].balance)).toBe(100);
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
