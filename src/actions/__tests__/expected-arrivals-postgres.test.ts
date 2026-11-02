import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// Real PostgreSQL rules and migrations, entirely in memory, with a role row security applies to.
const isolated = vi.hoisted(() => ({ signedIn: true, db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/session", () => ({ hasSession: async () => isolated.signedIn }));
vi.mock("@/actions/fx", () => ({ getRates: async () => ({ EUR: 1, USD: 1.25 }) }));
vi.mock("@/actions/settings", () => ({ getBaseCurrency: async () => "EUR", getDefaultAccountId: async () => null }));
import { addToExpected, listExpected, listExpectedArrivals, recordExpectedArrival, stopExpected, submitExpectedAddition, submitExpectedArrival, submitExpectedEdit, undoExpectedArrival, updateExpected } from "../expected";
import { deleteTransaction } from "../transactions";
import { getNetWorth } from "../networth";

let engine: PGlite;
let sequence = 0;
const request = () => `quick-00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const form = (data: Record<string, string>) => {
  const value = new FormData();
  for (const [key, item] of Object.entries(data)) value.set(key, item);
  if (!value.has("requestId")) value.set("requestId", request());
  return value;
};
const today = () => new Date().toISOString().slice(0, 10);
const balance = async (id = "eur-a") => Number((await isolated.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)))[0].balance);
const row = async (id = "owed") => (await isolated.db.select().from(schema.expectedMoney).where(eq(schema.expectedMoney.id, id)))[0];
const incomes = () => isolated.db.select().from(schema.transactions);
const arrivals = () => isolated.db.select().from(schema.expectedArrivals);
const arrival = (extra: Record<string, string> = {}) => form({ id: "owed", amount: "30", date: today(), accountId: "eur-a", ...extra });
const edit = (extra: Record<string, string> = {}) => form({ id: "owed", name: "Friend owes me", amount: "100", currency: "EUR", arrival: "once", expectedAt: "", accountId: "", categoryId: "", notes: "", ...extra });

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await engine.exec(`CREATE ROLE expected_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO expected_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO expected_test;`);
}, 60_000);
afterAll(async () => { await engine.close(); });
beforeEach(async () => {
  isolated.signedIn = true;
  await engine.exec(`RESET ROLE; DELETE FROM users;
    INSERT INTO users(id) VALUES ('me'), ('them');
    SET ROLE expected_test;
    SELECT set_config('app.user_id','them',false);`);
  await isolated.db.insert(schema.accounts).values({ id: "theirs", name: "Other person's account", institution: "Synthetic", accountType: "bank", balance: "400", currency: "EUR" });
  await isolated.db.insert(schema.expectedMoney).values({ id: "their-owed", name: "Other person's money", amount: "50" });
  await engine.exec(`SELECT set_config('app.user_id','me',false)`);
  await isolated.db.insert(schema.accounts).values([
    { id: "eur-a", name: "Synthetic EUR", institution: "Synthetic", accountType: "bank", balance: "1000", currency: "EUR" },
    { id: "usd-a", name: "Synthetic USD", institution: "Synthetic", accountType: "bank", balance: "300", currency: "USD" },
  ]);
  await isolated.db.insert(schema.categories).values({ id: "pay", name: "Synthetic pay", kind: "income" });
  await isolated.db.insert(schema.expectedMoney).values([
    { id: "owed", name: "Friend owes me", amount: "100", categoryId: "pay", accountId: "eur-a" },
    { id: "salary", name: "Salary", amount: "1000", arrival: "monthly", expectedAt: new Date(new Date().getFullYear(), new Date().getMonth(), 25) },
  ]);
});

describe("some of it arrives", () => {
  it("adds what came to the account as income and leaves the rest expected", async () => {
    expect(await submitExpectedArrival(arrival())).toEqual({ saved: true });
    expect(await balance()).toBe(1030);
    const [income] = await incomes();
    expect(income).toMatchObject({ type: "income", currency: "EUR", categoryId: "pay", description: "Friend owes me", accountId: "eur-a" });
    expect(Number(income.amount)).toBe(30);
    const current = await row();
    expect(Number(current.received)).toBe(30);
    expect(current.settledAt).toBeNull();
    const list = await listExpected();
    expect(list.rows.find(r => r.id === "owed")?.remaining).toBe(70);
  });

  it("what has not arrived still counts toward nothing, and what has counts once", async () => {
    const before = (await getNetWorth()).total;
    await recordExpectedArrival(arrival());
    expect((await getNetWorth()).total).toBe(before + 30);
    await addToExpected(form({ id: "owed", amount: "500" }));
    expect((await getNetWorth()).total).toBe(before + 30);
  });

  it("a retry of the same request applies once", async () => {
    const same = arrival();
    await recordExpectedArrival(same);
    await recordExpectedArrival(same);
    expect(await balance()).toBe(1030);
    expect(await incomes()).toHaveLength(1);
    expect(await arrivals()).toHaveLength(1);
    expect(Number((await row()).received)).toBe(30);
  });

  it("two separate arrivals of the same amount both count", async () => {
    await recordExpectedArrival(arrival());
    await recordExpectedArrival(arrival());
    expect(await balance()).toBe(1060);
    expect(Number((await row()).received)).toBe(60);
  });

  it("reusing a request with other details is refused and changes nothing", async () => {
    const requestId = request();
    await recordExpectedArrival(arrival({ requestId }));
    expect(await submitExpectedArrival(arrival({ requestId, amount: "45" }))).toMatchObject({ error: expect.stringContaining("already used") });
    expect(await balance()).toBe(1030);
  });

  it("the last of it settles it, and it leaves the list", async () => {
    await recordExpectedArrival(arrival());
    await recordExpectedArrival(arrival({ amount: "70" }));
    expect((await row()).settledAt).not.toBeNull();
    expect((await listExpected()).rows.some(r => r.id === "owed")).toBe(false);
  });

  it("saying the rest is not coming closes it with only what came", async () => {
    await recordExpectedArrival(arrival({ closeRest: "on" }));
    expect((await row()).settledAt).not.toBeNull();
    expect(await balance()).toBe(1030);
    expect((await listExpected()).rows.some(r => r.id === "owed")).toBe(false);
  });

  it("already recorded some other way: no income, no balance moved, still counted as arrived", async () => {
    await recordExpectedArrival(arrival({ accountId: "none" }));
    expect(await balance()).toBe(1000);
    expect(await incomes()).toHaveLength(0);
    expect(Number((await row()).received)).toBe(30);
    expect((await arrivals())[0].transactionId).toBeNull();
  });

  it("into another currency needs the amount that actually landed, and invents no rate", async () => {
    expect(await submitExpectedArrival(arrival({ accountId: "usd-a" }))).toMatchObject({ error: expect.stringContaining("destination currency") });
    expect(await balance("usd-a")).toBe(300);
    expect(await arrivals()).toHaveLength(0);
    await recordExpectedArrival(arrival({ accountId: "usd-a", accountAmount: "35" }));
    expect(await balance("usd-a")).toBe(335);
    const [income] = await incomes();
    expect(income.currency).toBe("USD");
    expect(Number(income.amount)).toBe(35);
    expect(Number((await row()).received)).toBe(30);
    expect((await arrivals())[0]).toMatchObject({ currency: "EUR" });
  });

  it.each([
    ["no account chosen", { accountId: "" }, "where it landed"],
    ["a bad amount", { amount: "-5" }, "positive amount"],
    ["an impossible date", { date: "2026-02-30" }, "valid date"],
  ])("refuses %s without writing anything", async (_, extra, error) => {
    expect(await submitExpectedArrival(arrival(extra))).toMatchObject({ error: expect.stringContaining(error) });
    expect(await balance()).toBe(1000);
    expect(await arrivals()).toHaveLength(0);
  });

  it("cannot land in another person's account or be recorded against their money", async () => {
    expect((await submitExpectedArrival(arrival({ accountId: "theirs" }))).error).toBeTruthy();
    expect((await submitExpectedArrival(arrival({ id: "their-owed" }))).error).toBeTruthy();
    expect(await arrivals()).toHaveLength(0);
    expect(await incomes()).toHaveLength(0);
  });

  it("refuses money arriving on something already closed", async () => {
    await recordExpectedArrival(arrival({ amount: "100" }));
    expect(await submitExpectedArrival(arrival())).toMatchObject({ error: expect.stringContaining("already arrived") });
    expect(await balance()).toBe(1100);
  });

  it("needs a session", async () => {
    isolated.signedIn = false;
    expect(await submitExpectedArrival(arrival())).toEqual({ error: "Sign in again." });
    expect(await balance()).toBe(1000);
  });
});

describe("a monthly one arrives", () => {
  it("is not cancelled: it stays expected, at its next date and full amount", async () => {
    await recordExpectedArrival(arrival({ id: "salary", amount: "1000" }));
    const current = await row("salary");
    expect(current.settledAt).toBeNull();
    expect(current.active).toBe(true);
    expect(Number(current.received)).toBe(0);
    const listed = (await listExpected()).rows.find(r => r.id === "salary");
    expect(listed?.remaining).toBe(1000);
    expect(listed?.next?.getDate()).toBe(25);
  });
});

describe("more is coming", () => {
  it("makes a one-off bigger", async () => {
    await addToExpected(form({ id: "owed", amount: "50" }));
    expect(Number((await row()).amount)).toBe(150);
  });

  it("adds to a monthly one for this time only", async () => {
    await addToExpected(form({ id: "salary", amount: "200" }));
    const current = await row("salary");
    expect(Number(current.amount)).toBe(1000);
    expect(Number(current.extra)).toBe(200);
    expect((await listExpected()).rows.find(r => r.id === "salary")?.remaining).toBe(1200);
    await recordExpectedArrival(arrival({ id: "salary", amount: "1200" }));
    expect((await listExpected()).rows.find(r => r.id === "salary")?.remaining).toBe(1000);
  });

  it("a retry adds once; a bad amount adds nothing", async () => {
    const same = form({ id: "owed", amount: "50" });
    await addToExpected(same);
    await addToExpected(same);
    expect(Number((await row()).amount)).toBe(150);
    expect(await submitExpectedAddition(form({ id: "owed", amount: "abc" }))).toMatchObject({ error: expect.stringContaining("positive amount") });
    expect(Number((await row()).amount)).toBe(150);
  });

  it("cannot touch another person's money", async () => {
    expect((await submitExpectedAddition(form({ id: "their-owed", amount: "5" }))).error).toBeTruthy();
  });
});

describe("what was said changes", () => {
  it("changes every field, and moves no money", async () => {
    expect(await submitExpectedEdit(edit({ name: "Ana owes me", amount: "80", expectedAt: "2026-12-01", accountId: "usd-a", categoryId: "pay", notes: "for dinner", currency: "USD" }))).toEqual({ saved: true });
    const current = await row();
    expect(current).toMatchObject({ name: "Ana owes me", currency: "USD", accountId: "usd-a", categoryId: "pay", notes: "for dinner" });
    expect(Number(current.amount)).toBe(80);
    expect(await balance()).toBe(1000);
    expect(await incomes()).toHaveLength(0);
  });

  it("saving a monthly one untouched keeps its anchor, and a new day starts clean", async () => {
    const before = await row("salary");
    const fields = { id: "salary", name: "Salary", amount: "1100", arrival: "monthly", dayOfMonth: "25", currency: "EUR", accountId: "", categoryId: "", notes: "" };
    await updateExpected(form(fields));
    expect((await row("salary")).expectedAt).toEqual(before.expectedAt);
    await recordExpectedArrival(arrival({ id: "salary", amount: "100" }));
    expect((await row("salary")).nextAt).not.toBeNull();
    await updateExpected(form({ ...fields, dayOfMonth: "10" }));
    const moved = await row("salary");
    expect(moved.expectedAt?.getDate()).toBe(10);
    expect(moved.nextAt).toBeNull();
    expect(Number(moved.received)).toBe(100);
  });

  it("cannot go to or below what already arrived, nor change currency under it", async () => {
    await recordExpectedArrival(arrival());
    expect(await submitExpectedEdit(edit({ amount: "30" }))).toMatchObject({ error: expect.stringContaining("already arrived") });
    expect(await submitExpectedEdit(edit({ currency: "USD" }))).toMatchObject({ error: expect.stringContaining("already arrived") });
    expect(Number((await row()).amount)).toBe(100);
  });

  it.each([
    ["no name", { name: "  " }],
    ["a bad amount", { amount: "0" }],
    ["a bad currency", { currency: "euros" }],
    ["another person's account", { accountId: "theirs" }],
    ["an expense category or none that exists", { categoryId: "missing" }],
  ])("refuses %s with a message and changes nothing", async (_, extra) => {
    const result = await submitExpectedEdit(edit({ name: "Changed", ...extra }));
    expect(result.error).toBeTruthy();
    expect(result.error).not.toContain("Connection interrupted");
    expect((await row()).name).toBe("Friend owes me");
  });

  it("a stale retry does not undo a later edit", async () => {
    const first = edit({ amount: "80" });
    await updateExpected(first);
    await updateExpected(edit({ amount: "90" }));
    await updateExpected(first);
    expect(Number((await row()).amount)).toBe(90);
  });
});

describe("undoing an arrival", () => {
  const undo = async () => { const list = await listExpectedArrivals(); await undoExpectedArrival(form({ id: list[0].id })); };

  it("takes back the income and the balance, and it is expected as before", async () => {
    await recordExpectedArrival(arrival());
    await undo();
    expect(await balance()).toBe(1000);
    expect(await incomes()).toHaveLength(0);
    expect(await arrivals()).toHaveLength(0);
    expect(Number((await row()).received)).toBe(0);
  });

  it("reopens something that had been settled", async () => {
    await recordExpectedArrival(arrival({ amount: "100" }));
    await undo();
    const current = await row();
    expect(current.settledAt).toBeNull();
    expect(Number(current.received)).toBe(0);
    expect((await listExpected()).rows.find(r => r.id === "owed")?.remaining).toBe(100);
  });

  it("puts a monthly one back on its date with what it had", async () => {
    await addToExpected(form({ id: "salary", amount: "200" }));
    const before = await row("salary");
    await recordExpectedArrival(arrival({ id: "salary", amount: "1200" }));
    await undo();
    const current = await row("salary");
    expect(Number(current.extra)).toBe(200);
    expect(current.nextAt).toEqual(before.nextAt);
  });

  it("only the latest of each can be undone", async () => {
    await recordExpectedArrival(arrival());
    await recordExpectedArrival(arrival({ amount: "10" }));
    const list = await listExpectedArrivals();
    expect(list.map(a => [a.amount, a.undoable])).toEqual([[10, true], [30, false]]);
    await expect(undoExpectedArrival(form({ id: list[1].id }))).rejects.toThrow("most recent");
    expect(await balance()).toBe(1040);
  });

  it("if the income was already deleted in Cash Flow, the balance is not reversed twice", async () => {
    await recordExpectedArrival(arrival());
    const [income] = await incomes();
    await deleteTransaction(form({ id: income.id }));
    expect(await balance()).toBe(1000);
    await undo();
    expect(await balance()).toBe(1000);
    expect(Number((await row()).received)).toBe(0);
  });

  it("an old retry after undoing does not apply again", async () => {
    const same = arrival();
    await recordExpectedArrival(same);
    await undo();
    await recordExpectedArrival(same);
    expect(await balance()).toBe(1000);
    expect(await arrivals()).toHaveLength(0);
  });

  it("cannot reach another person's arrival", async () => {
    await engine.exec(`SELECT set_config('app.user_id','them',false)`);
    await isolated.db.insert(schema.expectedArrivals).values({ id: "their-arrival", expectedId: "their-owed", amount: "5", currency: "EUR", arrivedAt: new Date() });
    await engine.exec(`SELECT set_config('app.user_id','me',false)`);
    await undoExpectedArrival(form({ id: "their-arrival" }));
    await engine.exec(`SELECT set_config('app.user_id','them',false)`);
    expect(await arrivals()).toHaveLength(1);
    await engine.exec(`SELECT set_config('app.user_id','me',false)`);
  });

  it("needs a session", async () => {
    await recordExpectedArrival(arrival());
    const [saved] = await arrivals();
    isolated.signedIn = false;
    await expect(undoExpectedArrival(form({ id: saved.id }))).rejects.toThrow();
    isolated.signedIn = true;
    expect(await balance()).toBe(1030);
  });
});

describe("stopping", () => {
  it("takes a one-off off the list without losing what came", async () => {
    await recordExpectedArrival(arrival());
    await stopExpected(form({ id: "owed" }));
    expect((await listExpected()).rows.some(r => r.id === "owed")).toBe(false);
    expect(await balance()).toBe(1030);
    expect(await arrivals()).toHaveLength(1);
  });
});
