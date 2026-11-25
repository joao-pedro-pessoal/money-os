import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
const fixture = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, full: false }));
vi.mock("@/db/client", () => ({ get db() { return fixture.db; } }));
vi.mock("@/actions/releaseEdition", () => ({ currentInvestments: async () => fixture.full }));
import { checkReportOutput, checkReportSource } from "../reportLimits";
let engine: PGlite;
beforeAll(async () => {
  engine = new PGlite(); fixture.db = drizzle(engine, { schema });
  await migrate(fixture.db, { migrationsFolder: "./drizzle" });
  await fixture.db.insert(schema.users).values([{ id: "report-a" }, { id: "report-b" }]);
  await engine.exec("CREATE ROLE report_bound_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO report_bound_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO report_bound_test; SET ROLE report_bound_test;");
  for (const [user, count] of [["report-a", 2], ["report-b", 12]] as const) {
    await engine.query("select set_config('app.user_id', $1, false)", [user]);
    await fixture.db.insert(schema.accounts).values({ id: `account-${user}`, name: "Synthetic", institution: "Synthetic", accountType: "bank" });
    await fixture.db.insert(schema.transactions).values(Array.from({ length: count }, () => ({ accountId: `account-${user}`, type: "expense" as const, date: new Date("2026-11-01"), amount: "-1" })));
  }
}, 60000);
afterAll(async () => { await engine?.close(); });
describe("PDF work bounds without loading source history into Node", () => {
  it("counts only the current person's rows under RLS", async () => {
    await engine.query("select set_config('app.user_id', 'report-a', false)");
    await expect(checkReportSource({ scope: "money" }, 5)).resolves.toBeUndefined();
    await engine.query("select set_config('app.user_id', 'report-b', false)");
    await expect(checkReportSource({ scope: "money" }, 5)).rejects.toThrow(/rows/);
  });
  it("cannot bypass the money-source bound by forging investment scope in the money edition", async () => {
    fixture.full = false;
    await expect(checkReportSource({ scope: "investments" }, 5)).rejects.toThrow(/rows/);
    fixture.full = true;
    await expect(checkReportSource({ scope: "investments" }, 5)).resolves.toBeUndefined();
  });
  it("checks output rows and text before allocating fonts or drawing pages", () => {
    expect(() => checkReportOutput({ points: Array(11).fill({ value: 1 }) }, 10)).toThrow(/rows/);
    expect(() => checkReportOutput({ notes: ["x".repeat(20001)] }, 10)).toThrow(/rows/);
    expect(() => checkReportOutput({ notes: Array(51).fill("x".repeat(20000)) }, 100)).toThrow(/rows/);
    expect(() => checkReportOutput({ points: [{ value: 1 }], notes: ["Synthetic"] }, 10)).not.toThrow();
  });
  it("bounds retained investment history even in a money-only PDF", async () => {
    await engine.query("select set_config('app.user_id', 'report-a', false)");
    fixture.full = false;
    await fixture.db.insert(schema.holdings).values(Array.from({ length: 6 }, (_, index) => ({ symbol: `SYNTHETIC${index}`, name: "Disposable", quantity: "1", avgEntryPrice: "1", currentPrice: "1" })));
    await expect(checkReportSource({ scope: "money" }, 5)).rejects.toThrow(/rows/);
  });
});
