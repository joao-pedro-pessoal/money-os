import { describe, expect, it } from "vitest";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { BACKUP_TABLES } from "../index";

const entries: [string, unknown][] = Object.entries(schema);
const tables = entries.filter((entry): entry is [string, PgTable] => is(entry[1], PgTable));
describe("personal backup coverage and dependency order", () => {
  it("includes every user-owned table, without exporting identity or shared market data", () => {
    const owned = tables.filter(([, table]) => getTableConfig(table).columns.some((column) => column.name === "user_id"));
    expect([...BACKUP_TABLES].sort()).toEqual(owned.map(([name]) => name).sort());
  });
  it("restores each parent before its children", () => {
    const order = new Map<string, number>(BACKUP_TABLES.map((name, index) => [name, index]));
    for (const [name, table] of tables) {
      if (!order.has(name)) continue;
      for (const key of getTableConfig(table).foreignKeys) {
        const parent = tables.find(([, candidate]) => candidate === key.reference().foreignTable)?.[0];
        if (parent && parent !== name && order.has(parent)) expect(order.get(parent), `${parent} before ${name}`).toBeLessThan(order.get(name)!);
      }
    }
  });
});
