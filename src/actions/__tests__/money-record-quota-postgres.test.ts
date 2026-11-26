import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

const fixture = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, signedIn: true, language: "en", address: "203.0.113.90" }));
vi.mock("@/db/client", () => ({ get db() { return fixture.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => fixture.signedIn }));
vi.mock("@/actions/language", () => ({ currentLanguage: async () => fixture.language }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": fixture.address }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from "next/cache";
import { createTransfer, submitTransfer, createInterestPayment, submitInterestPayment, deleteTransaction } from "../transactions";
import { acquireWork, WorkLimitedError } from "../workGate";

let engine: PGlite;
let sequence = 0;
const id = () => `quick-00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const form = (fields: Record<string, string>) => {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
};
const transfer = () => form({ requestId: id(), fromAccountId: "a-from", toAccountId: "a-to", amount: "1", date: "2026-11-26" });
const interest = () => form({ requestId: id(), accountId: "a-from", amount: "1", date: "2026-11-26" });
const as = (person: string) => engine.query("select set_config('app.user_id', $1, false)", [person]);
const finances = async () => ({
  accounts: await fixture.db.select().from(schema.accounts).orderBy(schema.accounts.id),
  movements: await fixture.db.select().from(schema.transactions).orderBy(schema.transactions.id),
  transfers: await fixture.db.select().from(schema.transfers).orderBy(schema.transfers.id),
  interest: await fixture.db.select().from(schema.interestPayments).orderBy(schema.interestPayments.id),
  receipts: await fixture.db.select().from(schema.auditLog).orderBy(schema.auditLog.id),
});
const expire = () => engine.exec("update work_gates set history='[]', leases='[]'");

beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-money-record-quota-test-only");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external requests allowed"); }));
  engine = new PGlite(); fixture.db = drizzle(engine, { schema });
  await migrate(fixture.db, { migrationsFolder: "./drizzle" });
  await engine.exec(`CREATE ROLE money_record_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO money_record_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO money_record_test;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO money_record_test;`);
}, 60_000);
beforeEach(async () => {
  fixture.signedIn = true; fixture.language = "en"; fixture.address = "203.0.113.90";
  vi.mocked(revalidatePath).mockReset(); vi.mocked(fetch).mockClear();
  await engine.exec(`RESET ROLE; DELETE FROM work_gates; DELETE FROM users;
    INSERT INTO users(id) VALUES ('record-a'), ('record-b'); SET ROLE money_record_test;`);
  await as("record-b");
  await fixture.db.insert(schema.accounts).values({ id: "b", name: "Synthetic B", institution: "Synthetic", accountType: "bank", balance: "200", currency: "EUR" });
  await as("record-a");
  await fixture.db.insert(schema.accounts).values([
    { id: "a-from", name: "Synthetic A", institution: "Synthetic", accountType: "bank", balance: "1000", currency: "EUR" },
    { id: "a-to", name: "Synthetic destination", institution: "Synthetic", accountType: "bank", balance: "200", currency: "EUR" },
  ]);
});
afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  await engine.exec(`RESET ROLE;
    DROP TRIGGER IF EXISTS fail_record ON transactions;
    DROP TRIGGER IF EXISTS fail_release ON work_gates;
    DROP FUNCTION IF EXISTS fail_money_record();
    SET ROLE money_record_test;`);
  vi.restoreAllMocks();
});
afterAll(async () => { await engine?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("transfer and interest admission before financial writes", () => {
  it("shares exactly one budget across both families and their direct/form RPCs", async () => {
    for (let i = 0; i < 30; i++) {
      if (i % 4 === 0) await createTransfer(transfer());
      if (i % 4 === 1) expect(await submitTransfer(transfer())).toEqual({ saved: true });
      if (i % 4 === 2) await createInterestPayment(interest());
      if (i % 4 === 3) expect(await submitInterestPayment(interest())).toEqual({ saved: true });
    }
    const before = await finances();
    expect(before.transfers).toHaveLength(16); expect(before.interest).toHaveLength(14);
    expect(before.accounts.map(row => Number(row.balance))).toEqual([998, 216]);
    await expect(createTransfer(transfer())).rejects.toBeInstanceOf(WorkLimitedError);
    await expect(createInterestPayment(interest())).rejects.toBeInstanceOf(WorkLimitedError);
    fixture.language = "pt";
    expect(await submitTransfer(transfer())).toMatchObject({ error: expect.stringContaining("Demasiados pedidos"), retryAfter: expect.any(Number) });
    fixture.language = "en";
    expect(await submitInterestPayment(interest())).toMatchObject({ error: expect.stringContaining("Too many requests"), retryAfter: expect.any(Number) });
    expect(await finances()).toEqual(before);
    // Same connection, separate person: no access to A's records and no use of A's personal budget.
    await as("record-b"); const own = interest(); own.set("accountId", "b");
    expect(await submitInterestPayment(own)).toEqual({ saved: true });
    const other = await finances(); expect(other.accounts).toHaveLength(1); expect(other.accounts[0].balance).toBe("201.00"); expect(other.movements).toHaveLength(1);
    await as("record-a"); expect(await finances()).toEqual(before);
  });

  it("shares the connection window across people without exposing its raw address", async () => {
    await engine.exec(`RESET ROLE; INSERT INTO users(id) VALUES ('record-c'), ('record-d'), ('record-e'); SET ROLE money_record_test;`);
    for (const person of ["record-c", "record-d", "record-e"]) {
      await as(person);
      await fixture.db.insert(schema.accounts).values({ id: person, name: "Synthetic", institution: "Synthetic", accountType: "bank", balance: "0", currency: "EUR" });
    }
    for (const [person, account] of [["record-a", "a-from"], ["record-b", "b"], ["record-c", "record-c"], ["record-d", "record-d"]]) {
      await as(person); const paid = interest(); paid.set("accountId", account);
      for (let i = 0; i < 30; i++) await createInterestPayment(paid);
    }
    await as("record-e"); const paid = interest(); paid.set("accountId", "record-e");
    expect(await submitInterestPayment(paid)).toMatchObject({ retryAfter: expect.any(Number) });
    expect((await finances()).movements).toEqual([]);
    const counters = JSON.stringify(await fixture.db.select().from(schema.workGates));
    expect(counters).not.toContain(fixture.address); expect(counters).not.toContain("record-a");
    fixture.address = "203.0.113.91";
    expect(await submitInterestPayment(paid)).toEqual({ saved: true });
  });

  it("bounds concurrent work before creating a receipt or movement", async () => {
    const first = await acquireWork("money-record"), second = await acquireWork("money-record");
    try {
      expect(await submitTransfer(transfer())).toMatchObject({ retryAfter: expect.any(Number) });
      expect(await submitInterestPayment(interest())).toMatchObject({ retryAfter: expect.any(Number) });
      expect((await finances()).receipts).toEqual([]);
      await first();
      expect(await submitTransfer(transfer())).toEqual({ saved: true });
    } finally { await first(); await second(); }
  });

  it("also enforces the hourly window, then admits an expired window", async () => {
    await createTransfer(transfer());
    const now = Number((await engine.query<{ now: number }>("select extract(epoch from clock_timestamp()) * 1000 as now")).rows[0].now);
    await fixture.db.update(schema.workGates).set({ history: JSON.stringify(Array(300).fill(now - 120_000)) });
    const before = await finances();
    expect(await submitInterestPayment(interest())).toMatchObject({ retryAfter: expect.any(Number) });
    expect(await finances()).toEqual(before);
    await fixture.db.update(schema.workGates).set({ history: JSON.stringify(Array(300).fill(now - 3601_000)) });
    expect(await submitInterestPayment(interest())).toEqual({ saved: true });
  });

  it("retains retry identity across a quota refusal and never recreates a deleted transfer", async () => {
    const sent = transfer(), paid = interest();
    expect(await submitTransfer(sent)).toEqual({ saved: true }); expect(await submitInterestPayment(paid)).toEqual({ saved: true });
    const before = await finances();
    // Exhaust admission through retries, which remain bounded even after the financial commit.
    for (let i = 0; i < 28; i++) await createTransfer(sent);
    expect(await submitTransfer(sent)).toHaveProperty("retryAfter"); expect(await submitInterestPayment(paid)).toHaveProperty("retryAfter");
    expect(await finances()).toEqual(before);
    await expire();
    expect(await submitTransfer(sent)).toEqual({ saved: true }); expect(await submitInterestPayment(paid)).toEqual({ saved: true });
    expect(await finances()).toEqual(before);
    const changed = new FormData(); for (const [key, value] of sent) changed.set(key, value); changed.set("amount", "2");
    expect(await submitTransfer(changed)).toMatchObject({ error: expect.stringContaining("different details") });
    await deleteTransaction(form({ id: String(sent.get("requestId")) }));
    expect(await submitTransfer(sent)).toMatchObject({ error: "This transfer has already been deleted." });
    expect((await finances()).transfers).toEqual([]);
  });

  it("keeps foreign account references isolated behind admission", async () => {
    const wrong = transfer(); wrong.set("toAccountId", "b");
    expect(await submitTransfer(wrong)).toEqual({ error: "Choose two active accounts." });
    const wrongInterest = interest(); wrongInterest.set("accountId", "b");
    expect(await submitInterestPayment(wrongInterest)).toEqual({ error: "Choose an active account." });
    expect((await finances()).receipts).toEqual([]);
    await as("record-b"); expect((await finances()).accounts[0].balance).toBe("200.00"); expect((await finances()).movements).toEqual([]);
  });

  it("rolls back a failed write and releases its reservation before retry", async () => {
    const paid = interest();
    await engine.exec(`RESET ROLE; CREATE FUNCTION fail_money_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic-private-sql'; END $$;
      CREATE TRIGGER fail_record BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION fail_money_record(); SET ROLE money_record_test;`);
    expect(await submitInterestPayment(paid)).toEqual({ error: "Could not save. Retry with the same details." });
    const before = await finances(); expect(before.movements).toEqual([]); expect(before.interest).toEqual([]); expect(before.receipts).toEqual([]);
    expect((await fixture.db.select().from(schema.workGates)).every(row => row.leases === "[]")).toBe(true);
    await engine.exec("RESET ROLE; DROP TRIGGER fail_record ON transactions; SET ROLE money_record_test;");
    expect(await submitInterestPayment(paid)).toEqual({ saved: true });
  });

  it("does not report a committed record as failed when revalidation fails", async () => {
    vi.mocked(revalidatePath).mockImplementation(() => { throw new Error("synthetic-revalidation"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await submitTransfer(transfer())).toEqual({ saved: true }); expect(await submitInterestPayment(interest())).toEqual({ saved: true });
    expect((await finances()).transfers).toHaveLength(1); expect((await finances()).interest).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("money_record_revalidation_failed");
  });

  it("does not turn a failed lease release into an announced financial failure", async () => {
    await engine.exec(`RESET ROLE; CREATE FUNCTION fail_money_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.leases = '[]' THEN RAISE EXCEPTION 'synthetic-release'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_release BEFORE UPDATE ON work_gates FOR EACH ROW EXECUTE FUNCTION fail_money_record(); SET ROLE money_record_test;`);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await submitInterestPayment(interest())).toEqual({ saved: true }); expect((await finances()).interest).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("work_gate_release_failed");
  });

  it("authenticates and rejects malformed input before admission", async () => {
    fixture.signedIn = false;
    await expect(createTransfer(transfer())).rejects.toThrow("session has expired");
    await expect(createInterestPayment(interest())).rejects.toThrow("session has expired");
    expect(await submitTransfer(transfer())).toHaveProperty("error"); expect(await submitInterestPayment(interest())).toHaveProperty("error");
    fixture.signedIn = true;
    const malformed = transfer(); malformed.set("requestId", "invalid"); expect(await submitTransfer(malformed)).toHaveProperty("error");
    const invalid = interest(); invalid.set("amount", "Infinity"); expect(await submitInterestPayment(invalid)).toHaveProperty("error");
    expect(await fixture.db.select().from(schema.workGates)).toEqual([]);
    expect((await finances()).receipts).toEqual([]);
  });
});
