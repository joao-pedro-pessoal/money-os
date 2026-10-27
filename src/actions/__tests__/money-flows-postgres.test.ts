import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// Real PostgreSQL rules and migrations, entirely in memory. No production
// client, .env, broker calls or persisted personal data in this suite.
const isolated = vi.hoisted(() => ({ base: "EUR", db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/session", () => ({ hasSession: async () => true }));
vi.mock("@/actions/fx", () => ({ getRates: async () => ({ EUR: 1, USD: 1.25 }) }));
vi.mock("@/actions/settings", () => ({ getBaseCurrency: async () => isolated.base, getDefaultAccountId: async () => null }));
import { createTransaction, createQuickTransaction, undoQuickTransaction, updateTransaction, deleteTransaction, createTransfer, createInterestPayment } from "../transactions";
import { createBucket, updateBucket, deleteBucket, addToAllocation, setAllocation, listBucketsWithTotals } from "../buckets";
import { createBudget, updateBudget, deleteBudget, listBudgets, getUnbudgetedSpending, getBudgetsLeft, getKeptForBudgets, toggleBudgetCategory } from "../budgets";
import { createSubscription, updateSubscription, toggleSubscription, deleteSubscription } from "../subscriptions";
import { createHolding, updateHolding, updateHoldingPrice, reinforceHolding, sellHolding, addRewards } from "../investments";
import { setHoldingAllocation } from "../purpose";
import { createLiability, updateLiability } from "../liabilities";
import { createExpected } from "../expected";
import { planDistribution, applyDistribution } from "../distribute";
import { answerSubscriptionCharge, recordSubscriptionCharge } from "../subscriptionCharges";

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
  isolated.base = "EUR";
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
    DROP TRIGGER IF EXISTS fail_money_insert ON transactions;
    DROP TRIGGER IF EXISTS fail_money_allocation ON bucket_allocations;
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

describe("general audit: debts, expected income, interest and goals", () => {
  const debt = (extra: Record<string, string> = {}) => form({ name: "Synthetic debt", balance: "500", currency: "EUR", kind: "personal_loan", ...extra });
  it.each(["", "NaN", "not a number"])("does not turn an invalid debt balance (%s) into zero", async balance => {
    await expect(createLiability(debt({ balance }))).rejects.toThrow(); expect(await isolated.db.select().from(schema.liabilities)).toEqual([]);
  });
  it("an invalid debt edit preserves what is owed", async () => {
    await createLiability(debt()); const [row] = await isolated.db.select().from(schema.liabilities);
    await expect(updateLiability(debt({ id: row.id, balance: "invalid" }))).rejects.toThrow();
    expect(Number((await isolated.db.select().from(schema.liabilities))[0].balance)).toBe(500);
  });
  it("a debt cannot point at another person's account", async () => {
    await expect(createLiability(debt({ accountId: "foreign" }))).rejects.toThrow(); expect(await isolated.db.select().from(schema.liabilities)).toEqual([]);
  });
  it("rejects a negative optional monthly debt payment", async () => {
    await expect(createLiability(debt({ monthlyPayment: "-20" }))).rejects.toThrow();
  });
  it("does not attach expected income to a foreign account or category", async () => {
    for (const extra of [{ accountId: "foreign" }, { categoryId: "foreign-category" }] as Record<string, string>[]) {
      await expect(createExpected(form({ name: "Synthetic expectation", amount: "20", ...extra }))).rejects.toThrow();
    }
    expect(await isolated.db.select().from(schema.expectedMoney)).toEqual([]);
  });
  it("an impossible expected-income date is rejected rather than silently becoming undated", async () => {
    await expect(createExpected(form({ name: "Synthetic expectation", amount: "20", expectedAt: "2026-02-30", arrival: "once" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.expectedMoney)).toEqual([]);
  });
  it("an interest payment rolls back if the ledger cannot be written", async () => {
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_money_insert BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(createInterestPayment(form({ requestId: request(), accountId: "eur-a", amount: "5", date: today() }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.interestPayments)).toEqual([]); expect(await balance("eur-a")).toBe(1000);
  });
  it("repeating an interest payment records one receipt and one income", async () => {
    const data=form({ requestId: request(), accountId: "usd-a", amount: "5", date: today() });
    await createInterestPayment(data); await createInterestPayment(data);
    expect(await isolated.db.select().from(schema.interestPayments)).toHaveLength(1); expect(await txs()).toHaveLength(1); expect(await balance("usd-a")).toBe(305);
  });
  it("refuses negative interest instead of changing its sign", async () => {
    await expect(createInterestPayment(form({ requestId: request(), accountId: "eur-a", amount: "-5", date: today() }))).rejects.toThrow(); expect(await txs()).toEqual([]);
  });
  it("refuses an interest receipt on someone else's account", async () => {
    await expect(createInterestPayment(form({ requestId: request(), accountId: "foreign", amount: "5", date: today() }))).rejects.toThrow(); expect(await isolated.db.select().from(schema.interestPayments)).toEqual([]);
  });
  it("one existing expense cannot answer two different subscription charges", async () => {
    await createSubscription(sub({ name: "First service" })); await createSubscription(sub({ name: "Second service" }));
    const [a,b] = await isolated.db.select().from(schema.subscriptions);
    await createTransaction(form({ accountId: "eur-a", type: "expense", amount: "10", date: today(), categoryId: "food" })); const [expense]=await txs();
    expect(await answerSubscriptionCharge(form({ subscriptionId: a.id, dueOn: today(), answer: "matched", transactionId: expense.id }))).toEqual({ ok: true });
    expect(await answerSubscriptionCharge(form({ subscriptionId: b.id, dueOn: today(), answer: "matched", transactionId: expense.id }))).toHaveProperty("error");
    expect(await isolated.db.select().from(schema.subscriptionCharges)).toHaveLength(1);
  });
  it("a stale proposal cannot record a charge for a cancelled subscription", async () => {
    await createSubscription(sub()); const [row]=await isolated.db.select().from(schema.subscriptions);
    await toggleSubscription(form({ id: row.id, active: "false" }));
    expect(await recordSubscriptionCharge(form({ subscriptionId: row.id, dueOn: today(), accountId: "eur-a", amount: "10", date: today() }))).toHaveProperty("error"); expect(await txs()).toEqual([]);
  });
  it("goal totals convert cash without mislabelling individual allocations", async () => {
    await createBucket(form({ name: "Mixed goal" })); const [goal]=await isolated.db.select().from(schema.buckets);
    await setAllocation(form({ accountId: "eur-a", bucketId: goal.id, amount: "100" })); await setAllocation(form({ accountId: "usd-a", bucketId: goal.id, amount: "125" }));
    const [view]=await listBucketsWithTotals(); expect(view.total).toBe(200); expect(view).toHaveProperty("baseCurrency","EUR");
    expect(view.allocations.find(a=>a.accountId==="usd-a")).toMatchObject({ amount: 125, currency: "USD" });
    isolated.base="USD"; expect((await listBucketsWithTotals())[0].total).toBe(250);
  });
  it("unknown goal currencies are reported instead of summed as the base currency", async () => {
    await createBucket(form({ name: "Missing FX goal" })); const [goal]=await isolated.db.select().from(schema.buckets);
    await isolated.db.update(schema.accounts).set({ currency: "JPY" }).where(eq(schema.accounts.id,"usd-a"));
    await setAllocation(form({ accountId: "usd-a", bucketId: goal.id, amount: "125" }));
    const [view]=await listBucketsWithTotals(); expect(view.total).toBe(0); expect(view).toHaveProperty("unconverted",[{amount:125,currency:"JPY"}]);
  });
  it("a distribution plans in the base currency and writes account-currency allocations", async () => {
    await isolated.db.update(schema.accounts).set({ balance: "0" }).where(eq(schema.accounts.id,"eur-a")); await isolated.db.update(schema.accounts).set({ balance: "0" }).where(eq(schema.accounts.id,"eur-b"));
    await createBucket(form({ name: "Distribution goal" }));
    const plan=await planDistribution(100); expect(plan.available).toBe(240);
    await applyDistribution(form({ amount: "100", strategy: "priority", requestId: request() }));
    const [allocation]=await isolated.db.select().from(schema.bucketAllocations); expect(Number(allocation.amount)).toBe(125); expect(allocation.accountId).toBe("usd-a");
  });
});

describe("audit: recovery and distribution boundaries", () => {
  it("deleting newly recorded interest removes both the income and receipt, without recreating it on replay", async () => {
    const data=form({ requestId: request(), accountId: "eur-a", amount: "5", date: today() });
    await createInterestPayment(data); const [income]=await txs(); await deleteTransaction(form({id:income.id}));
    expect(await isolated.db.select().from(schema.interestPayments)).toEqual([]); expect(await balance("eur-a")).toBe(1000);
    await expect(createInterestPayment(data)).rejects.toThrow(); expect(await txs()).toEqual([]);
  });
  it("a distribution replay does not reserve twice", async () => {
    await createBucket(form({name:"Replay goal"})); const data=form({amount:"50",strategy:"priority",requestId:request()});
    await applyDistribution(data); await applyDistribution(data);
    expect((await isolated.db.select().from(schema.bucketAllocations)).reduce((sum,a)=>sum+Number(a.amount),0)).toBe(50);
  });
  it("a distribution rolls back all goals and its receipt on failure", async () => {
    await createBucket(form({name:"Rollback goal"}));
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER fail_money_allocation BEFORE INSERT ON bucket_allocations FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(applyDistribution(form({amount:"50",strategy:"priority",requestId:request()}))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.bucketAllocations)).toEqual([]);
    expect((await isolated.db.select().from(schema.auditLog)).filter(a=>a.action==="money_distributed")).toEqual([]);
  });
  it("a distribution never advertises more reserved money than it can fund", async () => {
    await createBucket(form({name:"Capacity goal"})); const plan=await planDistribution(2000);
    expect(plan.distributed).toBe(1440); expect(plan.sourcedMoves.reduce((sum,m)=>sum+m.amount,0)).toBe(1440);
  });
  it("a rounded conversion never allocates more than the native cents available", async () => {
    await isolated.db.update(schema.accounts).set({balance:"0"}).where(eq(schema.accounts.id,"eur-a"));
    await isolated.db.update(schema.accounts).set({balance:"0"}).where(eq(schema.accounts.id,"eur-b"));
    await isolated.db.update(schema.accounts).set({balance:"0.02"}).where(eq(schema.accounts.id,"usd-a"));
    await createBucket(form({name:"Rounding goal"}));
    await applyDistribution(form({amount:"0.02",strategy:"priority",requestId:request()}));
    expect((await isolated.db.select().from(schema.bucketAllocations)).reduce((sum,a)=>sum+Number(a.amount),0)).toBeLessThanOrEqual(0.02);
  });
  it("two subscription matches cannot claim the same expense concurrently", async () => {
    await createSubscription(sub({ name: "Concurrent A" })); await createSubscription(sub({ name: "Concurrent B" })); const subs=await isolated.db.select().from(schema.subscriptions);
    await createTransaction(form({accountId:"eur-a",type:"expense",amount:"10",date:today(),categoryId:"food"})); const [expense]=await txs();
    const results=await Promise.all(subs.map(s=>answerSubscriptionCharge(form({subscriptionId:s.id,dueOn:today(),answer:"matched",transactionId:expense.id}))));
    expect(results.filter(r=>"ok" in r)).toHaveLength(1); expect(await isolated.db.select().from(schema.subscriptionCharges)).toHaveLength(1);
  });
});

describe("audit: investment relationship ownership", () => {
  const holding = { symbol: "AUDIT.TEST", quantity: "1", avgEntryPrice: "10", currentPrice: "10", accountId: "eur-a", currency: "EUR" };
  it("a manual holding cannot refer to another person's account", async () => {
    await expect(createHolding(form({ ...holding, accountId: "foreign" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.holdings)).toEqual([]);
  });
  it("a holding edit cannot move the position into another person's account", async () => {
    await isolated.db.insert(schema.holdings).values({ id: "audit-holding", ...holding });
    await expect(updateHolding(form({ ...holding, id: "audit-holding", accountId: "foreign" }))).rejects.toThrow();
    expect((await isolated.db.select().from(schema.holdings))[0].accountId).toBe("eur-a");
  });
  it("a position cannot be allocated to another person's goal", async () => {
    await isolated.db.insert(schema.holdings).values({ id: "audit-holding", ...holding });
    await expect(setHoldingAllocation(form({ holdingId: "audit-holding", bucketId: "foreign-bucket", percent: "50" }))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.holdingAllocations)).toEqual([]);
  });
  it.each(["", "-10", "101", "NaN"])("invalid allocation percentage %s leaves a position alone", async percent => {
    await isolated.db.insert(schema.holdings).values({ id: "audit-holding", ...holding });
    await createBucket(form({name:"Investment goal"})); const [goal]=await isolated.db.select().from(schema.buckets);
    await expect(setHoldingAllocation(form({holdingId:"audit-holding",bucketId:goal.id,percent}))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.holdingAllocations)).toEqual([]);
  });
  it("rejects a position belonging to another person", async () => {
    await engine.exec(`SELECT set_config('app.user_id','flow-b',false)`);
    await isolated.db.insert(schema.holdings).values({ id: "foreign-holding", ...holding, accountId: "foreign" });
    await engine.exec(`SELECT set_config('app.user_id','flow-a',false)`);
    await expect(setHoldingAllocation(form({holdingId:"foreign-holding",bucketId:"foreign-bucket",percent:"50"}))).rejects.toThrow("Holding not found");
    expect(await isolated.db.select().from(schema.holdingAllocations)).toEqual([]);
  });
  it("invalid input preserves an existing share rather than deleting or changing it", async () => {
    await isolated.db.insert(schema.holdings).values({ id: "audit-holding", ...holding });
    await createBucket(form({name:"Investment goal"})); const [goal] = await isolated.db.select().from(schema.buckets);
    await setHoldingAllocation(form({holdingId:"audit-holding",bucketId:goal.id,percent:"25,50"}));
    for (const percent of ["", "-10", "101", "NaN", "Infinity", "1.001"]) {
      await expect(setHoldingAllocation(form({holdingId:"audit-holding",bucketId:goal.id,percent}))).rejects.toThrow();
      expect(Number((await isolated.db.select().from(schema.holdingAllocations))[0].percent)).toBe(25.5);
    }
    await setHoldingAllocation(form({holdingId:"audit-holding",bucketId:goal.id,percent:"0"}));
    expect(await isolated.db.select().from(schema.holdingAllocations)).toEqual([]);
  });
  it("creates a valid holding with its snapshot and rolls all of it back if audit fails", async () => {
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER fail_money_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(createHolding(form(holding))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.holdings)).toEqual([]);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toEqual([]);
    await engine.exec(`RESET ROLE; DROP TRIGGER fail_money_audit ON audit_log; SET ROLE money_flows_test;`);
    await createHolding(form(holding));
    expect(await isolated.db.select().from(schema.holdings)).toHaveLength(1);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toHaveLength(1);
  });
  it("rolls an allocation back when its audit cannot be saved", async () => {
    await isolated.db.insert(schema.holdings).values({ id: "audit-holding", ...holding });
    await createBucket(form({name:"Investment goal"})); const [goal] = await isolated.db.select().from(schema.buckets);
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER fail_money_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(setHoldingAllocation(form({holdingId:"audit-holding",bucketId:goal.id,percent:"50"}))).rejects.toThrow();
    expect(await isolated.db.select().from(schema.holdingAllocations)).toEqual([]);
  });
  it("allocating the same position/goal pair twice updates the one share", async () => {
    await isolated.db.insert(schema.holdings).values({ id: "audit-holding", ...holding });
    await createBucket(form({name:"Investment goal"})); const [goal]=await isolated.db.select().from(schema.buckets);
    const data=form({holdingId:"audit-holding",bucketId:goal.id,percent:"50"});await setHoldingAllocation(data);await setHoldingAllocation(data);
    const rows=await isolated.db.select().from(schema.holdingAllocations);expect(rows).toHaveLength(1);expect(Number(rows[0].percent)).toBe(50);
  });
});

describe("manual investment operation safety", () => {
  const seed = async () => isolated.db.insert(schema.holdings).values({
    id: "operation-holding", symbol: "TEST.OPERATION", accountId: "eur-a", quantity: "10",
    avgEntryPrice: "10", currentPrice: "12", realizedPnl: "0", rewardsEarned: "5", currency: "EUR",
  });
  const read = async () => (await isolated.db.select().from(schema.holdings).where(eq(schema.holdings.id, "operation-holding")))[0];
  const operations = [
    ["price", updateHoldingPrice, {currentPrice:"15"}],
    ["reinforce", reinforceHolding, {quantity:"2",price:"15"}],
    ["sell", sellHolding, {quantity:"2",price:"15"}],
    ["rewards", addRewards, {amount:"2"}],
  ] as const;
  it.each(operations)("rolls back %s entirely when audit fails", async (_name, action, values) => {
    await seed(); const before = await read();
    await engine.exec(`RESET ROLE; CREATE FUNCTION synthetic_money_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;
      CREATE TRIGGER fail_money_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION synthetic_money_failure(); SET ROLE money_flows_test;`);
    await expect(action(form({id:"operation-holding",...values}))).rejects.toThrow();
    expect(await read()).toEqual(before);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toEqual([]);
  });
  it.each(operations)("refuses %s for another person's position", async (_name, action, values) => {
    await seed();
    await engine.exec(`SELECT set_config('app.user_id','flow-b',false)`);
    await expect(action(form({id:"operation-holding",...values}))).rejects.toThrow("Holding not found");
    await engine.exec(`SELECT set_config('app.user_id','flow-a',false)`);
    expect(Number((await read()).quantity)).toBe(10);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toEqual([]);
  });
  it.each(["", "-1", "NaN", "Infinity", "0x10", "1.00001"])("refuses invalid price %s without touching the position", async value => {
    await seed(); const before = await read();
    await expect(updateHoldingPrice(form({id:"operation-holding",currentPrice:value}))).rejects.toThrow();
    expect(await read()).toEqual(before);
  });
  it.each([reinforceHolding, sellHolding])("refuses invalid quantities and prices in a trade", async action => {
    await seed(); const before = await read();
    for (const quantity of ["", "0", "-1", "NaN", "Infinity", "0.000000001"]) {
      await expect(action(form({id:"operation-holding",quantity,price:"12"}))).rejects.toThrow();
      expect(await read()).toEqual(before);
    }
    for (const price of ["", "-1", "NaN", "Infinity", "1.00001"]) {
      await expect(action(form({id:"operation-holding",quantity:"1",price}))).rejects.toThrow();
      expect(await read()).toEqual(before);
    }
  });
  it.each(["", "0", "-1", "NaN", "Infinity", "1.001"])("refuses invalid received rewards %s", async amount => {
    await seed(); const before = await read();
    await expect(addRewards(form({id:"operation-holding",amount}))).rejects.toThrow();
    expect(await read()).toEqual(before);
  });
  it("refuses a sale larger than the registered position", async () => {
    await seed(); const before = await read();
    await expect(sellHolding(form({id:"operation-holding",quantity:"11",price:"12"}))).rejects.toThrow();
    expect(await read()).toEqual(before);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toEqual([]);
  });
  it("keeps both simultaneous reinforcements", async () => {
    await seed();
    await Promise.all([reinforceHolding(form({id:"operation-holding",quantity:"2",price:"15"})),reinforceHolding(form({id:"operation-holding",quantity:"2",price:"15"}))]);
    const row = await read(); expect(Number(row.quantity)).toBe(14); expect(Number(row.avgEntryPrice)).toBeCloseTo(160/14, 3);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toHaveLength(2);
  });
  it("keeps both simultaneous sales and their realised gain", async () => {
    await seed();
    await Promise.all([sellHolding(form({id:"operation-holding",quantity:"2",price:"12"})),sellHolding(form({id:"operation-holding",quantity:"2",price:"12"}))]);
    const row = await read(); expect(Number(row.quantity)).toBe(6); expect(Number(row.realizedPnl)).toBe(8);
  });
  it("keeps both simultaneous reward receipts", async () => {
    await seed();
    await Promise.all([addRewards(form({id:"operation-holding",amount:"2"})),addRewards(form({id:"operation-holding",amount:"3"}))]);
    expect(Number((await read()).rewardsEarned)).toBe(10);
  });
  it("records a zero-price full sale and keeps cash balances separate", async () => {
    await seed();
    await sellHolding(form({id:"operation-holding",quantity:"10",price:"0"}));
    const row = await read(); expect(Number(row.quantity)).toBe(0); expect(Number(row.realizedPnl)).toBe(-100);
    expect(Number(row.avgEntryPrice)).toBe(10); expect(await balance("eur-a")).toBe(1000);
  });
  it("accepts comma decimals, updates price history and accumulates rewards", async () => {
    await seed();
    await updateHoldingPrice(form({id:"operation-holding",currentPrice:"12,3456"}));
    expect(Number((await read()).currentPrice)).toBe(12.3456);
    await addRewards(form({id:"operation-holding",amount:"0,25"}));
    expect(Number((await read()).rewardsEarned)).toBe(5.25);
    expect(await isolated.db.select().from(schema.holdingSnapshots)).toHaveLength(1);
  });
});
