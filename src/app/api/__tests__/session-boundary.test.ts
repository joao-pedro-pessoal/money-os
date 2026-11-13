import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => ({ data: 0, fonts: 0 }));
vi.mock("@/actions/session", () => ({ hasSession: async () => false, currentUserId: async () => null }));
vi.mock("@/db/client", () => ({ db: new Proxy({}, { get() { effects.data++; throw new Error("Private data read before authentication"); } }) }));
vi.mock("@/actions/reportFonts", () => ({ reportFonts: async () => { effects.fonts++; throw new Error("Fonts loaded before authentication"); } }));
vi.mock("@/actions/pageLanguage", () => ({ textForRequest: async () => (text: string) => text }));
vi.mock("@/actions/language", () => ({ currentLanguage: async () => "en" }));

beforeAll(() => vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION", "full"));
beforeEach(() => { effects.data = 0; effects.fonts = 0; });
afterAll(() => vi.unstubAllEnvs());

describe("private route handlers verify the session themselves", () => {
  const routes = {
    alerts: () => import("../alerts/route"),
    widget: () => import("../widget/route"),
    "report/pdf": () => import("../report/pdf/route"),
  };
  it.each(["alerts", "widget", "report/pdf"] as const)("%s refuses before data or PDF work", async (route) => {
    const { GET } = await routes[route]();
    const { NextRequest } = await import("next/server");
    const result: Response = await GET(new NextRequest(`http://synthetic.invalid/api/${route}`));
    expect(result.status).toBe(401);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(effects.data).toBe(0);
    expect(effects.fonts).toBe(0);
  });
});
