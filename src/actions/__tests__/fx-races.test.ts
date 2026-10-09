import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { exchangeRates } from "@/db/schema";

type Row = { quote: string; rate: string; manual?: boolean; source?: string; base?: string };
type Conflict = { target: unknown[]; set: Partial<Row>; setWhere?: SQL };
const fake = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  beforeWrite: null as (() => void) | null,
}));

function beforeWrite() {
  const run = fake.beforeWrite;
  fake.beforeWrite = null;
  run?.();
}

function allows(condition: SQL | undefined, row: Row): boolean {
  if (!condition) return true;
  const query = new PgDialect().sqlToQuery(condition);
  if (!query.sql.includes('"manual"')) return true;
  expect(query.params).toContain(false);
  return !row.manual;
}

vi.mock("@/db/client", () => ({ db: {
  select: () => ({ from: () => {
    // Independent snapshots reproduce a read followed by another request's write.
    const snapshot = [...fake.rows.values()].map((r) => ({ ...r }));
    return Object.assign(Promise.resolve(snapshot), { where: async () => snapshot });
  } }),
  update: () => ({ set: (values: Partial<Row>) => ({ where: async (condition: SQL) => {
    beforeWrite();
    const query = new PgDialect().sqlToQuery(condition);
    for (const row of fake.rows.values()) {
      if (query.params.includes(row.quote) && allows(condition, row)) Object.assign(row, values);
    }
  } }) }),
  insert: () => ({ values: (values: Row) => {
    const write = async (conflict?: Conflict) => {
      beforeWrite();
      const current = fake.rows.get(values.quote);
      if (!current) { fake.rows.set(values.quote, { manual: false, ...values }); return; }
      if (!conflict) throw new Error("duplicate key: exchange_rates_user_quote");
      expect(conflict.target).toEqual([exchangeRates.userId, exchangeRates.quote]);
      if (allows(conflict.setWhere, current)) Object.assign(current, conflict.set);
    };
    return { then: (resolve: () => void, reject: (e: unknown) => void) => write().then(resolve, reject),
      onConflictDoUpdate: (conflict: Conflict) => write(conflict) };
  } }),
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/fx", () => ({
  DEFAULT_BASE_CURRENCY: "EUR",
  fetchRates: async () => ({ EUR: 1, USD: 1.25, GBP: 0.85 }),
}));
import { refreshRates, setManualRate } from "../fx";

beforeEach(() => { fake.rows.clear(); fake.beforeWrite = null; });

describe("overlapping exchange-rate requests", () => {
  it("preserves a rate pinned after the refresh read its snapshot", async () => {
    fake.rows.set("USD", { quote: "USD", rate: "1.1", manual: false });
    fake.beforeWrite = () => fake.rows.set("USD", { quote: "USD", rate: "1.5", manual: true, source: "manual" });
    expect(await refreshRates()).toMatchObject({ ok: true });
    expect(fake.rows.get("USD")).toMatchObject({ rate: "1.5", manual: true, source: "manual" });
  });

  it("lets two initial refreshes both finish all currencies", async () => {
    const results = await Promise.all([refreshRates(), refreshRates()]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect([...fake.rows.keys()].sort()).toEqual(["GBP", "USD"]);
  });

  it("saves a manual choice even if a refresh inserted that currency first", async () => {
    fake.beforeWrite = () => fake.rows.set("USD", { quote: "USD", rate: "1.25", manual: false });
    const form = new FormData();
    form.set("quote", "USD"); form.set("rate", "1.5");
    await expect(setManualRate(form)).resolves.toBeUndefined();
    expect(fake.rows.get("USD")).toMatchObject({ rate: "1.5", manual: true });
  });
});
