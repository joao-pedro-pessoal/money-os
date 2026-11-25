import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const fixture = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, user: "outbound-a", authenticated: true, full: true, scheduledFull: false, language: "en", mode: "ok", calls: [] as string[] }));
vi.mock("@/db/client", async () => ({
  get db() { return fixture.db; },
  asUser: async <T>(id: string, work: () => Promise<T>) => {
    const previous = fixture.user; fixture.user = id;
    await fixture.db.execute(`select set_config('app.user_id', '${id}', false)`);
    try { return await (await import("@/db/acting")).asUser(id, work); }
    finally { fixture.user = previous; await fixture.db.execute(`select set_config('app.user_id', '${previous}', false)`); }
  },
}));
vi.mock("@/actions/session", () => ({ hasSession: async () => fixture.authenticated, currentUserId: async () => fixture.authenticated ? fixture.user : null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/language", () => ({ currentLanguage: async () => fixture.language }));
vi.mock("@/actions/releaseEdition", () => ({
  requireInvestments: async () => { if (!fixture.full) throw new Error("Investments unavailable"); await (await import("@/actions/requestSession")).requireServerSession(); },
  investmentsFor: () => fixture.scheduledFull,
}));
vi.mock("@/actions/quotes", () => ({ refreshQuotedPrices: async () => { throw new Error("Synthetic private quote diagnostic"); } }));
vi.mock("@/actions/connections", () => ({ syncAllConnections: vi.fn() }));
import { refreshRates, refreshRatesAction, unpinRate } from "../fx";
import { searchAssets } from "../assetSearch";
import { acquireWork, withScheduledWork } from "../workGate";
import { GET, POST } from "@/app/api/sync/route";

let engine: PGlite, server: Server, origin: string;
const nativeFetch = globalThis.fetch;
const as = async (id: string) => { fixture.user = id; await engine.query("select set_config('app.user_id', $1, false)", [id]); };
const syncRequest = () => new Request("https://money.example/api/sync", { headers: { authorization: "Bearer synthetic-cron-secret" } });
beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-outbound-quota-secret"); vi.stubEnv("CRON_SECRET", "synthetic-cron-secret"); vi.stubEnv("SYNC_SECRET", "");
  engine = new PGlite(); fixture.db = drizzle(engine, { schema });
  await migrate(fixture.db, { migrationsFolder: "./drizzle" });
  await engine.exec("DELETE FROM users;");
  await fixture.db.insert(schema.users).values([{ id: "outbound-a" }, { id: "outbound-b" }]);
  await engine.exec("CREATE ROLE outbound_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO outbound_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO outbound_test; SET ROLE outbound_test;");
  server = createServer((request, response) => {
    fixture.calls.push(request.url ?? "");
    if (fixture.mode === "error") { response.writeHead(503, { "Content-Type": "text/html" }); response.end("private synthetic provider diagnostic"); return; }
    if (fixture.mode === "slow") { const timer = setTimeout(() => response.end('{}'), 1000); request.on('close', () => clearTimeout(timer)); return; }
    response.writeHead(200, { "Content-Type": "application/json" });
    if (fixture.mode === "large") { response.write('{"padding":"'); response.end('x'.repeat(70_000) + '"}'); return; }
    if (fixture.mode === "invalid") { response.end('{"base":"EUR","rates":{"USD":0}}'); return; }
    if (request.url?.startsWith("/latest")) response.end(JSON.stringify({ base: "EUR", rates: { USD: 1.25, GBP: 0.85 } }));
    else response.end(JSON.stringify({ quotes: [{ symbol: "SYNTH", shortname: "Synthetic result", quoteType: "ETF", exchange: "TEST" }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture address unavailable");
  origin = `http://127.0.0.1:${address.port}`;
  vi.stubGlobal("fetch", vi.fn((url: string | URL, options?: RequestInit) => {
    const target = new URL(url);
    if (!["api.frankfurter.app", "query1.finance.yahoo.com"].includes(target.hostname)) throw new Error("Unexpected provider target");
    return nativeFetch(origin + target.pathname + target.search, options);
  }));
}, 60_000);
beforeEach(async () => {
  fixture.calls = []; fixture.mode = "ok"; fixture.authenticated = true; fixture.full = true; fixture.scheduledFull = false; fixture.language = "en";
  await fixture.db.delete(schema.workGates);
  for (const id of ["outbound-a", "outbound-b"]) { await as(id); await fixture.db.delete(schema.exchangeRates); await fixture.db.delete(schema.holdings); }
  await as("outbound-a");
  await fixture.db.insert(schema.exchangeRates).values({ quote: "USD", rate: "1.5", manual: true, source: "manual" });
  await fixture.db.insert(schema.holdings).values({ symbol: "LOCAL", name: "Synthetic saved asset", quantity: "1", avgEntryPrice: "1", currentPrice: "1" });
  vi.mocked(fetch).mockClear();
});
afterAll(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } await engine?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("outbound quotas and real HTTP stand-ins with migrated PostgreSQL", () => {
  it("shares the FX budget across direct, legacy and unpin RPCs, without changing a pinned rate on refusal", async () => {
    expect((await refreshRates()).ok).toBe(true); expect((await refreshRatesAction()).ok).toBe(true); expect((await refreshRates()).ok).toBe(true);
    const form = new FormData(); form.set("quote", "USD"); fixture.language = "pt";
    expect(await unpinRate(form)).toMatchObject({ ok: false, retryAfter: expect.any(Number), error: expect.stringContaining("Demasiados") });
    expect(fixture.calls).toHaveLength(3);
    expect((await fixture.db.select().from(schema.exchangeRates).where(eq(schema.exchangeRates.quote, "USD")))[0]).toMatchObject({ rate: "1.5000000000", manual: true });
  });
  it("updates automatic rates atomically and leaves manual rates pinned", async () => {
    expect((await refreshRates()).ok).toBe(true);
    expect((await fixture.db.select().from(schema.exchangeRates).where(eq(schema.exchangeRates.quote, "USD")))[0].manual).toBe(true);
    const form = new FormData(); form.set("quote", "USD"); expect((await unpinRate(form)).ok).toBe(true);
    expect((await fixture.db.select().from(schema.exchangeRates).where(eq(schema.exchangeRates.quote, "USD")))[0]).toMatchObject({ rate: "1.2500000000", manual: false });
    expect(fixture.calls[0]).toBe("/latest?from=EUR");
  });
  it.each(["error", "large", "invalid"])("keeps saved rates and pinning when a provider returns %s", async mode => {
    fixture.mode = mode; const form = new FormData(); form.set("quote", "USD");
    expect(await unpinRate(form)).toMatchObject({ ok: false, error: expect.not.stringContaining("diagnostic") });
    const rows = await fixture.db.select().from(schema.exchangeRates); expect(rows).toHaveLength(1); expect(rows[0].manual).toBe(true);
  });
  it("rolls back the unpin and every rate if a later SQL write fails", async () => {
    await engine.exec("RESET ROLE; CREATE FUNCTION reject_test_rate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quote = 'GBP' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_rate BEFORE INSERT ON exchange_rates FOR EACH ROW EXECUTE FUNCTION reject_test_rate(); SET ROLE outbound_test;");
    try {
      const form = new FormData(); form.set("quote", "USD"); expect((await unpinRate(form)).ok).toBe(false);
      const rows = await fixture.db.select().from(schema.exchangeRates); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ manual: true, rate: "1.5000000000" });
    } finally { await engine.exec("RESET ROLE; DROP TRIGGER reject_rate ON exchange_rates; DROP FUNCTION reject_test_rate(); SET ROLE outbound_test;"); }
  });
  it("refuses a simultaneous FX refresh before contacting the provider", async () => {
    const release = await acquireWork("fx-refresh");
    try { expect(await refreshRates()).toMatchObject({ ok: false, retryAfter: expect.any(Number) }); expect(fixture.calls).toEqual([]); }
    finally { await release(); }
    expect((await refreshRates()).ok).toBe(true);
  });
  it("limits search before local queries/provider calls and keeps the manual ticker path available", async () => {
    for (let i = 0; i < 20; i++) expect((await searchAssets("Synthetic")).results.length).toBeGreaterThan(0);
    expect(await searchAssets("Synthetic")).toMatchObject({ results: [], retryAfter: expect.any(Number) });
    expect(fixture.calls).toHaveLength(20); expect(fixture.calls[0]).toContain("q=Synthetic");
    expect(await searchAssets("S")).toEqual({ results: [], warning: null });
  });
  it("returns only this person's saved search matches during a provider outage", async () => {
    fixture.mode = "error"; fixture.language = "pt";
    const a = await searchAssets("Synthetic"); expect(a.results.map(row => row.symbol)).toContain("LOCAL"); expect(a.warning).toContain("indisponível");
    await as("outbound-b"); const b = await searchAssets("Synthetic"); expect(b.results).toEqual([]);
  });
  it("rejects oversized and malformed search input before quota or providers", async () => {
    for (const query of ["x".repeat(201), null, {}]) expect((await searchAssets(query as string)).results).toEqual([]);
    expect(fixture.calls).toEqual([]); expect(await fixture.db.select().from(schema.workGates)).toEqual([]);
  });
  it("cancels an unresponsive HTTP provider without changing saved rates", async () => {
    fixture.mode = "slow";
    const timeout = AbortSignal.timeout.bind(AbortSignal); const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(40));
    try { expect((await refreshRates()).ok).toBe(false); expect((await fixture.db.select().from(schema.exchangeRates))).toHaveLength(1); }
    finally { spy.mockRestore(); }
  });
  it("checks session and edition before counters, saved data or providers", async () => {
    fixture.authenticated = false;
    await expect(refreshRates()).rejects.toThrow("Sign in again"); await expect(searchAssets("Synthetic")).rejects.toThrow("Sign in again");
    fixture.authenticated = true; fixture.full = false; await expect(searchAssets("Synthetic")).rejects.toThrow("Investments unavailable");
    expect(await fixture.db.select().from(schema.workGates)).toEqual([]); expect(fixture.calls).toEqual([]);
  });
  it("authenticates the scheduler before spending its shared GET/POST budget", async () => {
    expect((await GET(new Request("https://money.example/api/sync"))).status).toBe(401);
    expect(await fixture.db.select().from(schema.workGates)).toEqual([]);
    const first = await GET(syncRequest()); expect(first.status).toBe(200); expect(first.headers.get("cache-control")).toContain("no-store");
    expect(await first.json()).toMatchObject({ accounts: 2, fxUpdated: 2, accountsFailed: 0 });
    const second = await POST(new Request("https://money.example/api/sync", { method: "POST", headers: { "x-sync-secret": "synthetic-cron-secret" } }));
    expect(second.status).toBe(429); expect(Number(second.headers.get("retry-after"))).toBeGreaterThan(0); expect(fixture.calls).toHaveLength(2);
  });
  it("rejects overlapping scheduler work and treats provider outages as partial failure", async () => {
    await withScheduledWork(async () => { expect((await GET(syncRequest())).status).toBe(429); expect(fixture.calls).toEqual([]); });
    await fixture.db.delete(schema.workGates); fixture.mode = "error";
    const response = await GET(syncRequest()); expect(response.status).toBe(207); expect(await response.json()).toMatchObject({ fxUpdated: 0, accountsFailed: 2 });
  });
  it("counts an account once when both FX and pricing fail, and proceeds to the next person", async () => {
    fixture.mode = "error"; fixture.scheduledFull = true;
    const response = await GET(syncRequest()); expect(response.status).toBe(207);
    const body = await response.json(); expect(body).toMatchObject({ accounts: 2, accountsFailed: 2 });
    expect(JSON.stringify(body)).not.toContain("diagnostic"); expect(fixture.calls).toHaveLength(2);
  });
});
