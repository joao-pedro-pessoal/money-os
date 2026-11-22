import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { applyOrder, cleanOrder, MAX_ORDER_IDS, parseOrder } from "@/lib/ui/userOrder";

// Arranged order, against real migrations and row security in memory.
const isolated = vi.hoisted(() => ({ signedIn: true, db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../requestSession", () => ({ requireServerSession: async () => { if (!isolated.signedIn) throw new Error("Sign in again."); } }));
import { saveOrder } from "../order";
import { inSavedOrder, savedOrder } from "../orderStore";

let engine: PGlite;
const as = (user: string) => engine.exec(`SELECT set_config('app.user_id','${user}',false)`);

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await engine.exec(`CREATE ROLE user_order_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO user_order_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO user_order_test;`);
}, 60_000);
beforeEach(async () => {
  isolated.signedIn = true;
  await engine.exec(`RESET ROLE; DELETE FROM app_settings; DELETE FROM users;
    INSERT INTO users(id) VALUES ('order-a'), ('order-b');
    SET ROLE user_order_test;`);
  await as("order-a");
});
afterAll(async () => { await engine?.close(); });

describe("applying a saved order", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id }));
  const ids = (list: { id: string }[]) => list.map((item) => item.id);

  it("puts saved ids first and keeps everything else in its default order", () => {
    expect(ids(applyOrder(items, ["c", "a"], (i) => i.id))).toEqual(["c", "a", "b", "d"]);
    expect(ids(applyOrder(items, [], (i) => i.id))).toEqual(["a", "b", "c", "d"]);
    expect(ids(applyOrder(items, ["gone", "d"], (i) => i.id))).toEqual(["d", "a", "b", "c"]);
  });

  it("accepts only short, distinct, non-empty ids and ignores unreadable stored values", () => {
    expect(cleanOrder(["a", "b"])).toEqual(["a", "b"]);
    for (const bad of ["a", ["a", "a"], ["", "b"], [1], ["x".repeat(201)], Array.from({ length: MAX_ORDER_IDS + 1 }, (_, i) => `id${i}`)]) {
      expect(cleanOrder(bad)).toBeNull();
    }
    expect(parseOrder("not json")).toEqual([]);
    expect(parseOrder('{"a":1}')).toEqual([]);
    expect(parseOrder(null)).toEqual([]);
  });
});

describe("saving an arranged order", () => {
  it("keeps one order per list and person, replacing it on the next save", async () => {
    expect(await saveOrder("accounts", ["x", "y"])).toEqual({ saved: true });
    expect(await saveOrder("accounts", ["y", "x"])).toEqual({ saved: true });
    expect(await saveOrder("budgets", ["b1"])).toEqual({ saved: true });
    expect(await savedOrder("accounts")).toEqual(["y", "x"]);
    expect(await savedOrder("budgets")).toEqual(["b1"]);
    expect((await inSavedOrder("accounts", [{ id: "x" }, { id: "z" }, { id: "y" }], (i) => i.id)).map((i) => i.id)).toEqual(["y", "x", "z"]);
  });

  it("never shows one person's order to another", async () => {
    await saveOrder("dashboard", ["subscriptions", "accounts"]);
    await as("order-b");
    expect(await savedOrder("dashboard")).toEqual([]);
    await saveOrder("dashboard", ["accounts"]);
    await as("order-a");
    expect(await savedOrder("dashboard")).toEqual(["subscriptions", "accounts"]);
  });

  it("refuses an unknown list, a malformed order and a missing session, storing nothing", async () => {
    expect(await saveOrder("transactions", ["a"])).toEqual({ error: "Could not save the order. Try again." });
    expect(await saveOrder("accounts", "a,b")).toEqual({ error: "Could not save the order. Try again." });
    expect(await saveOrder("accounts", ["a", "a"])).toEqual({ error: "Could not save the order. Try again." });
    isolated.signedIn = false;
    expect(await saveOrder("accounts", ["a"])).toEqual({ error: "Sign in again." });
    expect(await savedOrder("accounts")).toEqual([]);
  });
});
