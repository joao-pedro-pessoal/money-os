import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

// The real migrations and row security, on an isolated in-memory PostgreSQL.
const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema> }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ hasSession: async () => true }));
vi.mock("../dashboard", () => ({ getPortfolioItems: async () => ({ items: [], baseCurrency: "EUR" }) }));
vi.mock("../investmentActivity", () => ({ getTradeAnalysis: async () => ({ rows: [], unconvertibleTrades: 0 }) }));
vi.mock("../fx", () => ({ getRates: async () => ({ EUR: 1 }), refreshRates: vi.fn() }));
vi.mock("../settings", () => ({ getBaseCurrency: async () => "EUR" }));
import { deletePlaylist, updateWatchlistItem } from "../playlists";
import { setHoldingTags } from "../investments";

let engine: PGlite;
const as = (id: string) => engine.query("select set_config('app.user_id', $1, false)", [id]);
const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) f.append(k, one);
  return f;
};
const playlistsOf = async (id: string) =>
  (await isolated.db.select({ ids: schema.holdings.playlistIds }).from(schema.holdings).where(eq(schema.holdings.id, id)))[0]?.ids;

beforeAll(async () => {
  engine = new PGlite();
  isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "person-a" }, { id: "person-b" }]);
  // Rows as the version before lists left them: one playlist in `playlist_id`.
  for (const who of ["person-a", "person-b"]) {
    await as(who);
    await isolated.db.insert(schema.playlists).values([{ id: `long-${who}`, name: "Long Term" }, { id: `crypto-${who}`, name: "Crypto" }]);
    await isolated.db.insert(schema.holdings).values({ id: `btc-${who}`, symbol: "BTC", quantity: "1", avgEntryPrice: "1", currentPrice: "1", legacyPlaylistId: `long-${who}` });
    await isolated.db.insert(schema.watchlistItems).values({ id: `watch-${who}`, symbol: "ETH", legacyPlaylistId: `crypto-${who}` });
  }
  // The carry-over migration, run again over those rows (it is idempotent).
  await engine.exec(readFileSync("drizzle/0070_playlists_carry_over.sql", "utf8").replaceAll("--> statement-breakpoint", ""));
  await engine.exec(`
    CREATE ROLE moneyos_playlists_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO moneyos_playlists_test;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moneyos_playlists_test;
    SET ROLE moneyos_playlists_test;
  `);
}, 60_000);
afterAll(async () => { await engine?.close(); });

describe("several playlists per position, in PostgreSQL with the real migrations and row security", () => {
  it("keep the playlist each row was already in", async () => {
    await as("person-a");
    expect(await playlistsOf("btc-person-a")).toEqual(["long-person-a"]);
    const [watch] = await isolated.db.select({ ids: schema.watchlistItems.playlistIds }).from(schema.watchlistItems);
    expect(watch.ids).toEqual(["crypto-person-a"]);
  });

  it("save every ticked playlist, dropping one that is not this person's", async () => {
    await as("person-a");
    await setHoldingTags(form({ id: "btc-person-a", playlistIdsSent: "1", playlistIds: ["long-person-a", "crypto-person-a", "long-person-b"] }));
    expect(await playlistsOf("btc-person-a")).toEqual(["long-person-a", "crypto-person-a"]);
  });

  it("are left alone by a form that never showed the boxes, and cleared by one that showed none ticked", async () => {
    await as("person-a");
    await setHoldingTags(form({ id: "btc-person-a", riskLevel: "high" }));
    expect(await playlistsOf("btc-person-a")).toEqual(["long-person-a", "crypto-person-a"]);
    await updateWatchlistItem(form({ id: "watch-person-a", symbol: "ETH", playlistIdsSent: "1" }));
    const [watch] = await isolated.db.select({ ids: schema.watchlistItems.playlistIds }).from(schema.watchlistItems);
    expect(watch.ids).toEqual([]);
  });

  it("lose only the deleted playlist, and nobody else's rows change", async () => {
    await as("person-a");
    await deletePlaylist(form({ id: "long-person-a" }));
    expect(await playlistsOf("btc-person-a")).toEqual(["crypto-person-a"]);
    expect((await isolated.db.select().from(schema.playlists)).map((p) => p.name)).toEqual(["Crypto"]);
    await as("person-b");
    expect(await playlistsOf("btc-person-b")).toEqual(["long-person-b"]);
  });
});
