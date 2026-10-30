import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// The account quick sheet's "set balance", against real migrations and RLS in
// memory. No production client, .env or personal data.
const isolated = vi.hoisted(() => ({ signedIn: true, db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/session", () => ({ hasSession: async () => isolated.signedIn }));
vi.mock("@/actions/fx", () => ({ getRates: async () => ({ EUR: 1, USD: 1.25 }) }));
vi.mock("@/actions/settings", () => ({ getBaseCurrency: async () => "EUR", getDefaultAccountId: async () => null }));
import { submitAccountBalance, updateAccountBalance } from "../accounts";

let engine: PGlite;
let sequence = 0;
const request = () => `quick-00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const form = (data: Record<string, string>) => {
  const value = new FormData();
  for (const [key, item] of Object.entries(data)) value.set(key, item);
  return value;
};
const balance = async (id: string) => Number((await isolated.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)))[0].balance);
const txs = () => isolated.db.select().from(schema.transactions);
const audits = () => isolated.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "balance_updated"));

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await engine.exec(`CREATE ROLE account_balance_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO account_balance_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO account_balance_test;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO account_balance_test;`);
}, 60_000);
beforeEach(async () => {
  isolated.signedIn = true;
  await engine.exec(`RESET ROLE; DELETE FROM users;
    INSERT INTO users(id) VALUES ('balance-a'), ('balance-b');
    SET ROLE account_balance_test;
    SELECT set_config('app.user_id','balance-b',false);`);
  await isolated.db.insert(schema.accounts).values({ id: "foreign", name: "Other person's account", institution: "Synthetic", accountType: "bank", balance: "400", currency: "EUR" });
  await engine.exec(`SELECT set_config('app.user_id','balance-a',false)`);
  await isolated.db.insert(schema.accounts).values({ id: "eur-a", name: "Synthetic EUR", institution: "Synthetic", accountType: "bank", balance: "1000", currency: "EUR" });
});
afterEach(async () => {
  await engine.exec(`RESET ROLE;
    DROP TRIGGER IF EXISTS fail_balance_movement ON transactions;
    DROP FUNCTION IF EXISTS synthetic_balance_failure();
    SET ROLE account_balance_test;`);
});
afterAll(async () => { await engine?.close(); });

describe("setting an account's balance from its quick sheet", () => {
  it("books the difference once, even when a lost response makes the phone send it again", async () => {
    const attempt = form({ accountId: "eur-a", newBalance: "950,50", classification: "expense", requestId: request() });
    expect(await submitAccountBalance(attempt)).toEqual({ saved: true });
    expect(await submitAccountBalance(attempt)).toEqual({ saved: true });
    expect(await balance("eur-a")).toBe(950.5);
    const rows = await txs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountId: "eur-a", type: "expense", amount: "-49.50" });
    expect(await audits()).toHaveLength(1);
  });

  it("a correction fixes the number without recording money in or out", async () => {
    expect(await submitAccountBalance(form({ accountId: "eur-a", newBalance: "1200", classification: "correction", requestId: request() }))).toEqual({ saved: true });
    expect(await balance("eur-a")).toBe(1200);
    expect(await txs()).toHaveLength(0);
  });

  it("refuses an unreadable balance, another person's account and a missing session, changing nothing", async () => {
    expect((await submitAccountBalance(form({ accountId: "eur-a", newBalance: "12.345", classification: "expense", requestId: request() }))).error)
      .toBe("Write the account's balance today, with at most two decimal places. 0 if it is empty.");
    expect(await submitAccountBalance(form({ accountId: "foreign", newBalance: "0", classification: "expense", requestId: request() })))
      .toEqual({ error: "Account not found" });
    isolated.signedIn = false;
    expect(await submitAccountBalance(form({ accountId: "eur-a", newBalance: "0", classification: "expense", requestId: request() })))
      .toEqual({ error: "Sign in again." });
    expect(await balance("eur-a")).toBe(1000);
    expect(await txs()).toHaveLength(0);
    expect(await audits()).toHaveLength(0);
  });

  it("refuses a rise booked as money out and a fall booked as money in", async () => {
    const mismatch = "Choose a type that matches the change in balance.";
    expect(await submitAccountBalance(form({ accountId: "eur-a", newBalance: "1017.83", classification: "expense", requestId: request() }))).toEqual({ error: mismatch });
    expect(await submitAccountBalance(form({ accountId: "eur-a", newBalance: "990", classification: "interest", requestId: request() }))).toEqual({ error: mismatch });
    await expect(updateAccountBalance(form({ accountId: "eur-a", newBalance: "1100", classification: "withdrawal" }))).rejects.toThrow(mismatch);
    expect(await balance("eur-a")).toBe(1000);
    expect(await txs()).toHaveLength(0);
    expect(await submitAccountBalance(form({ accountId: "eur-a", newBalance: "1017.83", classification: "deposit", requestId: request() }))).toEqual({ saved: true });
    expect((await txs())[0]).toMatchObject({ type: "income", amount: "17.83" });
  });

  it("keeps the old balance when the difference cannot be recorded", async () => {
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_balance_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_balance_movement BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION synthetic_balance_failure(); SET ROLE account_balance_test;`);
    const attempt = form({ accountId: "eur-a", newBalance: "900", classification: "expense", requestId: request() });
    expect((await submitAccountBalance(attempt)).error).toBeTruthy();
    await expect(updateAccountBalance(form({ accountId: "eur-a", newBalance: "900", classification: "expense" }))).rejects.toThrow();
    expect(await balance("eur-a")).toBe(1000);
    expect(await audits()).toHaveLength(0);
  });
});
