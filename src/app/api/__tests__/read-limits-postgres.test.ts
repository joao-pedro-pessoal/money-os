import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { NextRequest } from "next/server";
import * as schema from "@/db/schema";
const fixture = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, authenticated: true, language: "en", alerts: vi.fn(), widget: vi.fn(), source: vi.fn(), report: vi.fn(), fonts: vi.fn(), render: vi.fn() }));
vi.mock("@/db/client", () => ({ get db() { return fixture.db; } }));
vi.mock("@/actions/session", () => ({ hasSession: async () => fixture.authenticated }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/actions/language", () => ({ currentLanguage: async () => fixture.language }));
vi.mock("@/actions/pageLanguage", () => ({ textForRequest: async () => (text: string) => text }));
vi.mock("@/actions/alertData", () => ({ pageAlerts: fixture.alerts }));
vi.mock("@/actions/widgetData", () => ({ widgetSnapshot: fixture.widget }));
vi.mock("@/actions/reports", () => ({ loadReport: fixture.report }));
vi.mock("@/actions/reportFonts", () => ({ reportFonts: fixture.fonts }));
vi.mock("@/lib/reports/pdf", () => ({ renderReportPdf: fixture.render }));
vi.mock("@/actions/reportLimits", async original => ({ ...await original<typeof import("@/actions/reportLimits")>(), checkReportSource: fixture.source }));
import { getAlerts } from "@/actions/alerts";
import { GET as alerts } from "../alerts/route";
import { GET as widget } from "../widget/route";
import { GET as pdf } from "../report/pdf/route";
import { ReportLimitError } from "@/lib/reports/request";
let engine: PGlite;
const request = (query = "period=month&at=2026-10&scope=money") => new NextRequest(`https://money.example/api/report/pdf?${query}`);
beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-read-limit-secret");
  engine = new PGlite(); fixture.db = drizzle(engine, { schema });
  await migrate(fixture.db, { migrationsFolder: "./drizzle" });
  await engine.exec("CREATE ROLE read_limit_test NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO read_limit_test; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO read_limit_test; SET ROLE read_limit_test; SELECT set_config('app.user_id','syntheticreader',false);");
}, 60000);
beforeEach(async () => {
  await fixture.db.delete(schema.workGates);
  fixture.authenticated = true; fixture.language = "en";
  fixture.alerts.mockReset().mockResolvedValue({ alerts: [], currency: "EUR", checkedAt: "2026-11-25T10:00:00.000Z" });
  fixture.widget.mockReset().mockResolvedValue({ value: { currency: "EUR", updatedAt: "2026-11-25T10:00:00.000Z", netWorth: 100 }, generatedAt: "2026-11-25T10:00:00.000Z" });
  fixture.source.mockReset().mockResolvedValue(undefined);
  fixture.report.mockReset().mockResolvedValue({ kind: "month", key: "2026-10", label: "October 2026", from: "2026-10-01", to: "2026-10-31", currency: "EUR", today: "2026-11-25", notes: [], money: null, investments: null });
  fixture.fonts.mockReset().mockResolvedValue({}); fixture.render.mockReset().mockResolvedValue(new TextEncoder().encode("%PDF-synthetic"));
});
afterAll(async () => { await engine?.close(); vi.unstubAllEnvs(); });

describe("HTTP read quotas backed by real migrated PostgreSQL", () => {
  it("shares the alerts request budget between the RPC and Android endpoint", async () => {
    for (let i = 0; i < 6; i++) { expect((await getAlerts()).retryAfter).toBeUndefined(); expect((await alerts()).status).toBe(200); }
    fixture.language = "pt";
    const refused = await alerts();
    expect(refused.status).toBe(429); expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toMatchObject({ error: "rate_limited", message: expect.stringContaining("Demasiados pedidos") });
    expect(fixture.alerts).toHaveBeenCalledTimes(12);
  });
  it("limits widgets before calling their calculation and keeps private cache headers", async () => {
    for (let i = 0; i < 12; i++) {
      const response = await widget(); expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect((await widget()).status).toBe(429); expect(fixture.widget).toHaveBeenCalledTimes(12);
  });
  it("limits PDF generation before source reads, fonts and rendering", async () => {
    for (let i = 0; i < 3; i++) expect((await pdf(request())).headers.get("content-type")).toBe("application/pdf");
    const refused = await pdf(request()); expect(refused.status).toBe(429);
    expect(fixture.report).toHaveBeenCalledTimes(3); expect(fixture.fonts).toHaveBeenCalledTimes(3); expect(fixture.render).toHaveBeenCalledTimes(3);
  });
  it.each(["period=custom&from=0001-01-01&to=2026-01-01", "period=month&period=year", "period=custom&from=2026-02-31&to=2026-03-01"])("rejects an unsafe PDF query before data or fonts: %s", async query => {
    expect([400, 413]).toContain((await pdf(request(query))).status);
    expect(fixture.source).not.toHaveBeenCalled(); expect(fixture.report).not.toHaveBeenCalled(); expect(fixture.fonts).not.toHaveBeenCalled();
  });
  it("checks source and output bounds before loading font assets", async () => {
    fixture.source.mockRejectedValueOnce(new ReportLimitError("rows"));
    expect((await pdf(request())).status).toBe(413); expect(fixture.fonts).not.toHaveBeenCalled();
    fixture.report.mockResolvedValueOnce({ notes: ["x".repeat(20001)] });
    expect((await pdf(request())).status).toBe(413); expect(fixture.fonts).not.toHaveBeenCalled();
  });
  it("distinguishes temporary alert failure from a legitimate empty list", async () => {
    fixture.alerts.mockResolvedValueOnce({ alerts: [], currency: "", unavailable: true });
    expect((await alerts()).status).toBe(503);
    const ok = await alerts(); expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ checkedAt: "2026-11-25T10:00:00.000Z", alerts: [] });
  });
  it("does not disclose provider, database or personal diagnostics", async () => {
    fixture.widget.mockRejectedValueOnce(new Error("postgres://private:secret@host/financial-data"));
    const response = await widget(); expect(response.status).toBe(503); expect(await response.text()).not.toMatch(/postgres|secret|financial-data/);
  });
  it("refuses ended sessions before the counters or any cached response", async () => {
    fixture.authenticated = false;
    expect((await alerts()).status).toBe(401); expect((await widget()).status).toBe(401); expect((await pdf(request())).status).toBe(401);
    expect(fixture.alerts).not.toHaveBeenCalled(); expect(fixture.widget).not.toHaveBeenCalled(); expect(fixture.source).not.toHaveBeenCalled();
    expect(await fixture.db.select().from(schema.workGates)).toEqual([]);
  });
});
