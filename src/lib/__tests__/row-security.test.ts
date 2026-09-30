import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";

/**
 * Every table is either someone's or deliberately everyone's.
 *
 * Each person's rows are kept apart by Postgres (row-level security, set up in
 * the migrations) and not by the queries, which do not filter. That only holds
 * while every table of someone's money has a `user_id` that fills itself from
 * the connection and a policy that checks it — and a table added next month
 * without them would be readable by every account. So this fails the moment a
 * table is neither, and the SHARED list below is the one place a table may be
 * made everyone's, on purpose.
 */

/** Everyone's, and why each may be. */
const SHARED = new Map([
  ["users", "the accounts themselves: sign-in has to find one before anyone is signed in"],
  ["asset_profiles", "public market data fetched by symbol"],
  ["fund_holdings", "a fund's published holdings"],
  ["company_moves", "public price history of a company"],
  ["asset_logos", "public logos"],
  ["benchmark_prices", "an index's public closing prices"],
]);

const tables = (Object.values(schema) as unknown[])
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table));

const migrations = readdirSync(join(process.cwd(), "drizzle"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(process.cwd(), "drizzle", file), "utf8"))
  .join("\n");

const owned = tables.filter((t) => !SHARED.has(t.name));

describe("row-level security", () => {
  it("knows every table: none is shared by accident", () => {
    const unknownShared = [...SHARED.keys()].filter((name) => !tables.some((t) => t.name === name));
    expect(unknownShared, "SHARED names a table that no longer exists").toEqual([]);
    expect(owned.length).toBeGreaterThan(40);
  });

  it("gives every table of someone's money an owner that fills itself from the connection", () => {
    const missing = owned
      .filter((t) => {
        const column = t.columns.find((c) => c.name === "user_id");
        const fromConnection = column?.default !== undefined && JSON.stringify(column.default).includes("app.user_id");
        const toUsers = t.foreignKeys.some((fk) => {
          const ref = fk.reference();
          return ref.columns.some((c) => c.name === "user_id") && getTableConfig(ref.foreignTable).name === "users";
        });
        return !(column?.notNull && fromConnection && toUsers);
      })
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it("has a policy for every one of them in the migrations", () => {
    const missing = owned
      .filter(
        (t) =>
          !migrations.includes(`ALTER TABLE "${t.name}" ENABLE ROW LEVEL SECURITY;`) ||
          !migrations.includes(`CREATE POLICY "own_rows" ON "${t.name}"`)
      )
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  /**
   * A rule of uniqueness across accounts is a collision between them: a
   * category named "Food" in one account would stop anyone else from having
   * one — and an insert that quietly skipped the conflict would leave them
   * without it. Unique per account, or unique on something that is already
   * one account's (a row id it points at).
   */
  it("keeps every uniqueness rule inside one account", () => {
    const crossing: string[] = [];
    for (const t of owned) {
      const foreign = new Set(t.foreignKeys.flatMap((fk) => fk.reference().columns.map((c) => c.name)));
      const rules = [
        ...t.uniqueConstraints.map((u) => ({ name: u.name ?? "unique", columns: u.columns.map((c) => c.name) })),
        ...t.columns.filter((c) => c.isUnique).map((c) => ({ name: `${c.name} unique`, columns: [c.name] })),
        ...t.primaryKeys.map((p) => ({ name: "primary key", columns: p.columns.map((c) => c.name) })),
      ];
      for (const rule of rules) {
        if (!rule.columns.includes("user_id") && !rule.columns.some((c) => foreign.has(c))) {
          crossing.push(`${t.name}: ${rule.name} (${rule.columns.join(", ")})`);
        }
      }
    }
    expect(crossing).toEqual([]);
  });
});
