import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// Real PostgreSQL rules and migrations, entirely in memory. No production
// client, .env, broker calls or persisted personal data in this suite.
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/session", () => ({ hasSession: async () => true }));
vi.mock("@/actions/fx", () => ({ getRates: async () => ({ EUR: 1, USD: 1.25 }) }));
vi.mock("@/actions/settings", () => ({ getBaseCurrency: async () => "EUR", getDefaultAccountId: async () => null }));
import { createTransaction, createQuickTransaction, undoQuickTransaction, updateTransaction, deleteTransaction, createTransfer } from "../transactions";
import { createBucket, updateBucket, deleteBucket, addToAllocation, setAllocation } from "../buckets";
import { createBudget, updateBudget, deleteBudget, listBudgets, getUnbudgetedSpending, getBudgetsLeft, getKeptForBudgets, toggleBudgetCategory } from "../budgets";
import { createSubscription, updateSubscription, toggleSubscription, deleteSubscription } from "../subscriptions";
import { recordSubscriptionCharge } from "../subscriptionCharges";

let engine: PGlite;
let sequence = 0;
const form = (data: Record<string, string | string[]>) => {
  const value = new FormData();
  for (const [key, item] of Object.entries(data)) for (const entry of Array.isArray(item) ? item : [item]) value.append(key, entry);
  return value;
};
const today = () => new Date().toISOString().slice(0, 10);
const request = () => `quick-00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const balance = async (id: string) => Number((await isolated.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)))[0].balance);
const txs = () => isolated.db.select().from(schema.transactions);
const transfer = (extra: Record<string, string> = {}) => form({ fromAccountId: "eur-a", toAccountId: "eur-b", amount: "25", date: today(), requestId: request(), ...extra });
const budget = (extra: Record<string, string | string[]> = {}) => form({ name: "Synthetic budget", period: "monthly", limitAmount: "200", categoryIds: ["food"], anchorDate: today().slice(0, 7) + "-01", ...extra });
const sub = (extra: Record<string, string> = {}) => form({ name: "Synthetic subscription", amount: "10", cadence: "monthly", currency: "EUR", accountId: "eur-a", categoryId: "food", ...extra });

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await engine.exec(`CREATE ROLE money_flows_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO money_flows_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO money_flows_test;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO money_flows_test;`);
}, 60_000);
beforeEach(async () => {
  await engine.exec(`RESET ROLE; DELETE FROM users;
    INSERT INTO users(id) VALUES ('flow-a'), ('flow-b');
    SET ROLE money_flows_test;
    SELECT set_config('app.user_id','flow-b',false);`);
  await isolated.db.insert(schema.accounts).values({ id: "foreign", name: "Other person's account", institution: "Synthetic", accountType: "bank", balance: "400", currency: "EUR" });
  await isolated.db.insert(schema.categories).values({ id: "foreign-category", name: "Other person's category", kind: "expense" });
  await isolated.db.insert(schema.buckets).values({ id: "foreign-bucket", name: "Other person's goal" });
  await engine.exec(`SELECT set_config('app.user_id','flow-a',false)`);
  await isolated.db.insert(schema.accounts).values([
    { id: "eur-a", name: "Synthetic EUR A", institution: "Synthetic", accountType: "bank", balance: "1000", currency: "EUR" },
    { id: "eur-b", name: "Synthetic EUR B", institution: "Synthetic", accountType: "bank", balance: "200", currency: "EUR" },
    { id: "usd-a", name: "Synthetic USD", institution: "Synthetic", accountType: "bank", balance: "300", currency: "USD" },
  ]);
  await isolated.db.insert(schema.categories).values([{ id: "food", name: "Synthetic food", kind: "expense" }, { id: "salary", name: "Synthetic salary", kind: "income" }]);
});
afterEach(async () => {
  await engine.exec(`RESET ROLE;
    DROP TRIGGER IF EXISTS fail_transfer_write ON transfers;
    DROP TRIGGER IF EXISTS fail_transaction_delete ON transactions;
    DROP TRIGGER IF EXISTS fail_money_audit ON audit_log;
    DROP FUNCTION IF EXISTS synthetic_money_failure();
    SET ROLE money_flows_test;`);
});
afterAll(async () => { await engine?.close(); });

describe("manual money flows against isolated PostgreSQL", () => {
  it("creates, edits and deletes a movement, adjusting the account by each delta exactly once", async () => {
    await createTransaction(form({ accountId: "eur-a", type: "expense", amount: "20,50", date: today(), categoryId: "food" }));
    const [row] = await txs();
    expect(row.currency).toBe("EUR"); expect(await balance("eur-a")).toBe(979.5);
    await updateTransaction(form({ id: row.id, amount: "25", date: today(), categoryId: "food", description: "Edited" }));
    expect(await balance("eur-a")).toBe(975);
    await updateTransaction(form({ id: row.id, amount: "25", date: today(), categoryId: "food", description: "Edited" }));
    expect(await balance("eur-a")).toBe(975);
    await deleteTransaction(form({ id: row.id })); await deleteTransaction(form({ id: row.id }));
    expect(await balance("eur-a")).toBe(1000); expect(await txs()).toEqual([]);
  });

  it("retries a quick entry and its undo without duplicating money", async () => {
    const data = form({ requestId: request(), accountId: "usd-a", type: "income", amount: "12.50", date: today(), categoryId: "salary" });
    const first = await createQuickTransaction(data); await createQuickTransaction(data);
    expect(await balance("usd-a")).toBe(312.5); expect(await txs()).toHaveLength(1);
    if (!first.id) throw new Error("Synthetic quick entry failed");
    await undoQuickTransaction(first.id); await undoQuickTransaction(first.id);
    expect(await balance("usd-a")).toBe(300);
  });

  it("keeps the two actual amounts of a cross-currency transfer", async () => {
    await createTransfer(transfer({ fromAccountId: "usd-a", toAccountId: "eur-a", amount: "125", receivedAmount: "100" }));
    const rows = await txs();
    expect(rows.map(r => [r.currency, Number(r.amount)]).sort()).toEqual([["EUR", 100], ["USD", -125]]);
    expect(await balance("usd-a")).toBe(175); expect(await balance("eur-a")).toBe(1100);
    await deleteTransaction(form({ id: rows[0].id }));
    expect(await balance("usd-a")).toBe(300); expect(await balance("eur-a")).toBe(1000);
  });

  it("refuses a cross-currency transfer without a stated receiving amount", async () => {
    await expect(createTransfer(transfer({ toAccountId: "usd-a" }))).rejects.toThrow();
    expect(await txs()).toEqual([]);
  });

  it("replaying a transfer request creates just one pair of movements", async () => {
    const data = transfer(); await createTransfer(data); await createTransfer(data);
    expect(await txs()).toHaveLength(2); expect(await balance("eur-a")).toBe(975); expect(await balance("eur-b")).toBe(225);
  });

  it("rolls back both movements and balances if the link cannot be written", async () => {
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_transfer_write BEFORE INSERT ON transfers FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(createTransfer(transfer())).rejects.toThrow();
    expect(await txs()).toHaveLength(0); expect(await balance("eur-a")).toBe(1000); expect(await balance("eur-b")).toBe(200);
  });

  it("rolls back a transfer deletion if deleting a leg fails", async () => {
    await createTransfer(transfer()); const [row] = await txs();
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_transaction_delete BEFORE DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(deleteTransaction(form({ id: row.id }))).rejects.toThrow();
    expect(await balance("eur-a")).toBe(975); expect(await balance("eur-b")).toBe(225);
    expect(await isolated.db.select().from(schema.transfers)).toHaveLength(1); expect(await txs()).toHaveLength(2);
  });

  it("two simultaneous delete requests reverse a transfer only once", async () => {
    await createTransfer(transfer()); const [a, b] = await txs();
    await Promise.all([deleteTransaction(form({ id: a.id })), deleteTransaction(form({ id: b.id }))]);
    expect(await balance("eur-a")).toBe(1000); expect(await balance("eur-b")).toBe(200); expect(await txs()).toEqual([]);
  });

  it("does not use another person's account in a transfer", async () => {
    await expect(createTransfer(transfer({ toAccountId: "foreign" }))).rejects.toThrow();
    expect(await txs()).toEqual([]);
  });
});

describe("goals, budgets and subscriptions", () => {
  it("creates and edits a goal; setting, removing and deleting allocations never moves account money", async () => {
    await createBucket(form({ name: "Synthetic goal", targetAmount: "500" }));
    const [goal] = await isolated.db.select().from(schema.buckets);
    await updateBucket(form({ id: goal.id, name: "Renamed goal", targetAmount: "600", priority: "2" }));
    await setAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "50" }));
    await setAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "50" }));
    expect(await isolated.db.select().from(schema.bucketAllocations)).toHaveLength(1);
    expect(await balance("eur-a")).toBe(1000);
    await deleteBucket(form({ id: goal.id }));
    expect(await isolated.db.select().from(schema.bucketAllocations)).toEqual([]); expect(await balance("eur-a")).toBe(1000);
  });

  it("concurrent additions to a goal retain both amounts", async () => {
    await createBucket(form({ name: "Synthetic goal" })); const [goal] = await isolated.db.select().from(schema.buckets);
    await Promise.all([addToAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "10" })), addToAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "20" }))]);
    const rows = await isolated.db.select().from(schema.bucketAllocations);
    expect(rows).toHaveLength(1); expect(Number(rows[0].amount)).toBe(30);
  });

  it("refuses a negative exact allocation", async () => {
    await createBucket(form({ name: "Synthetic goal" })); const [goal] = await isolated.db.select().from(schema.buckets);
    await expect(setAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "-20" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.bucketAllocations)).toEqual([]);
  });

  it("does not link an allocation to another person's goal", async () => {
    await expect(setAllocation(form({ accountId: "eur-a", bucketId: "foreign-bucket", amount: "10" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.bucketAllocations)).toEqual([]);
  });

  it("converts spending before comparing it with the budget limit", async () => {
    await createBudget(budget());
    await createTransaction(form({ accountId: "usd-a", type: "expense", amount: "125", date: today(), categoryId: "food" }));
    const data = await listBudgets(); expect(data.items[0].spent).toBe(100);
    await updateBudget(form({ id: data.items[0].id, limitAmount: "300" }));
    expect((await listBudgets()).items[0].remaining).toBe(200);
    await deleteBudget(form({ id: data.items[0].id })); expect((await listBudgets()).items).toEqual([]);
  });

  it("converts spending outside any budget too", async () => {
    await createTransaction(form({ accountId: "usd-a", type: "expense", amount: "125", date: today(), categoryId: "food" }));
    expect((await getUnbudgetedSpending()).categories[0].amount).toBe(100);
  });

  it("a rejected budget category leaves no empty budget behind", async () => {
    await expect(createBudget(budget({ categoryIds: ["missing-category"] }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.budgets)).toEqual([]);
  });

  it("rejects another person's category before creating a budget", async () => {
    await expect(createBudget(budget({ categoryIds: ["foreign-category"] }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.budgets)).toEqual([]);
  });

  it("subscription forecasts, edits, cancellation and deletion never write the ledger", async () => {
    await createSubscription(sub()); const [row] = await isolated.db.select().from(schema.subscriptions);
    await updateSubscription(sub({ id: row.id, amount: "15" }));
    await toggleSubscription(form({ id: row.id, active: "false" }));
    await toggleSubscription(form({ id: row.id, active: "false" }));
    expect((await isolated.db.select().from(schema.subscriptions))[0].active).toBe(false);
    await toggleSubscription(form({ id: row.id, active: "true" }));
    await deleteSubscription(form({ id: row.id }));
    expect(await txs()).toEqual([]); expect(await balance("eur-a")).toBe(1000);
  });

  it("refuses an empty subscription name when editing", async () => {
    await createSubscription(sub()); const [row] = await isolated.db.select().from(schema.subscriptions);
    await expect(updateSubscription(sub({ id: row.id, name: "" }))).rejects.toThrow();
    expect((await isolated.db.select().from(schema.subscriptions))[0].name).toBe("Synthetic subscription");
  });

  it("rejects another person's account when creating a subscription", async () => {
    await expect(createSubscription(sub({ accountId: "foreign" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.subscriptions)).toEqual([]);
  });

  it("answering the same subscription charge twice records one expense", async () => {
    await createSubscription(sub()); const [row] = await isolated.db.select().from(schema.subscriptions);
    const data = form({ subscriptionId: row.id, dueOn: today(), accountId: "eur-a", amount: "10", date: today() });
    expect(await recordSubscriptionCharge(data)).toEqual({ ok: true });
    expect(await recordSubscriptionCharge(data)).toHaveProperty("error");
    expect(await balance("eur-a")).toBe(990); expect(await txs()).toHaveLength(1);
  });
});

describe("financial failure and retry boundaries", () => {
  it.each(["0", "-5", "1.001", "NaN", ""])("rejects an invalid transfer amount (%s) before moving money", async amount => {
    await expect(createTransfer(transfer({ amount }))).rejects.toThrow();
    expect(await txs()).toEqual([]); expect(await balance("eur-a")).toBe(1000);
  });
  it("rejects an impossible date", async () => {
    await expect(createTransfer(transfer({ date: "2026-02-30" }))).rejects.toThrow(); expect(await txs()).toEqual([]);
  });
  it("rejects changed details under an already-used transfer request", async () => {
    const data = transfer(); await createTransfer(data); data.set("amount", "30");
    await expect(createTransfer(data)).rejects.toThrow(); expect(await balance("eur-a")).toBe(975);
  });
  it("does not recreate a deleted transfer when an old request is replayed", async () => {
    const data = transfer(); await createTransfer(data); const [row] = await txs();
    await deleteTransaction(form({ id: row.id }));
    await expect(createTransfer(data)).rejects.toThrow();
    expect(await txs()).toEqual([]); expect(await balance("eur-a")).toBe(1000);
  });
  it("serialises two copies of the same transfer request", async () => {
    const data = transfer(); await Promise.all([createTransfer(data), createTransfer(data)]);
    expect(await txs()).toHaveLength(2); expect(await balance("eur-a")).toBe(975);
  });
  it("refuses an archived transfer account", async () => {
    await isolated.db.update(schema.accounts).set({ active: false }).where(eq(schema.accounts.id, "eur-b"));
    await expect(createTransfer(transfer())).rejects.toThrow(); expect(await txs()).toEqual([]);
  });
  it("refuses unequal amounts in the same currency", async () => {
    await expect(createTransfer(transfer({ receivedAmount: "24" }))).rejects.toThrow(); expect(await txs()).toEqual([]);
  });
  it("rolls back an allocation when its audit write fails", async () => {
    await createBucket(form({ name: "Synthetic goal" })); const [goal] = await isolated.db.select().from(schema.buckets);
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_money_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(setAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "10" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.bucketAllocations)).toEqual([]);
  });
  it("keeps missing budget rates visible in the reserve and forecast", async () => {
    await createBudget(budget());
    await isolated.db.insert(schema.transactions).values({ accountId: "eur-a", type: "expense", currency: "JPY", amount: "-500", date: new Date(), categoryId: "food" });
    const data = await listBudgets(); expect(data.items[0].unconverted).toBe(1);
    expect(await getBudgetsLeft()).toMatchObject({ total: 200, unconverted: 1 });
    expect(await getKeptForBudgets()).toMatchObject({ total: 200, unconverted: 1 });
  });
  it("reports unconverted unbudgeted spending instead of adding its raw amount", async () => {
    await isolated.db.insert(schema.transactions).values({ accountId: "eur-a", type: "expense", currency: "JPY", amount: "-500", date: new Date(), categoryId: "food" });
    const data = await getUnbudgetedSpending(); expect(data.categories).toEqual([]);
    expect(data.unconverted).toEqual([{ currency: "JPY", amount: 500 }]);
  });
  it("does not let a category change remove the last category or link a foreign one", async () => {
    await createBudget(budget()); const [row] = await isolated.db.select().from(schema.budgets);
    await expect(toggleBudgetCategory(form({ budgetId: row.id, categoryId: "food", on: "false" }))).rejects.toThrow();
    await expect(toggleBudgetCategory(form({ budgetId: row.id, categoryId: "foreign-category", on: "true" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.budgetCategories)).toHaveLength(1);
  });
  it("rejects an income category in a budget", async () => {
    await expect(createBudget(budget({ categoryIds: ["salary"] }))).rejects.toThrow(); expect((await listBudgets()).items).toEqual([]);
  });
  it("leaves subscription cancellation unchanged if the audit cannot be recorded", async () => {
    await createSubscription(sub()); const [row] = await isolated.db.select().from(schema.subscriptions);
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_money_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(toggleSubscription(form({ id: row.id, active: "false" }))).rejects.toThrow();
    expect((await isolated.db.select().from(schema.subscriptions))[0].active).toBe(true);
  });
  it("rejects changing a subscription to a foreign account", async () => {
    await createSubscription(sub()); const [row] = await isolated.db.select().from(schema.subscriptions);
    await expect(updateSubscription(sub({ id: row.id, accountId: "foreign" }))).rejects.toThrow();
    expect((await isolated.db.select().from(schema.subscriptions))[0].accountId).toBe("eur-a");
  });
  it("rejects a foreign subscription category", async () => {
    await expect(createSubscription(sub({ categoryId: "foreign-category" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.subscriptions)).toEqual([]);
  });
});
