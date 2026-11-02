import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ rates: [] as string[], prices: [] as string[], connections: [] as string[] }));
// One instance for the whole file: each test reloads the modules to choose its edition, and a real
// server has one copy of who is being worked for.
vi.mock("@/db/acting", async (original) => await original());
vi.mock("@/db/client", async () => ({
  asUser: (await import("@/db/acting")).asUser,
  db: { select: () => ({ from: async () => [{ id: "owner" }, { id: "ana" }] }) },
}));
// A scheduler has no session: nothing here may lean on a cookie.
vi.mock("@/actions/session", () => ({ currentUserId: async () => null, hasSession: async () => false }));
vi.mock("@/actions/fx", async () => {
  const { actingAs } = await import("@/db/acting");
  return { refreshRates: async () => { seen.rates.push(actingAs()!); return { ok: true }; } };
});
// The real refusal, so a person the edition does not cover would fail here and not only be skipped.
vi.mock("@/actions/quotes", async () => {
  const { actingAs } = await import("@/db/acting");
  // Imported per call: a mock's factory runs once, and each test loads its own edition.
  return { refreshQuotedPrices: async () => { await (await import("@/actions/releaseEdition")).requireInvestments(); seen.prices.push(actingAs()!); return { attempted: 2, updated: 1 }; } };
});
vi.mock("@/actions/connections", async () => {
  const { actingAs } = await import("@/db/acting");
  // Imported per call: a mock's factory runs once, and each test loads its own edition.
  return { syncAllConnections: async () => { await (await import("@/actions/releaseEdition")).requireInvestments(); seen.connections.push(actingAs()!); return []; } };
});

const load = async (edition: string) => {
  vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION", edition);
  vi.resetModules();
  return import("../route");
};
const url = "https://example.test/api/sync";

beforeEach(() => {
  seen.rates = []; seen.prices = []; seen.connections = [];
  vi.stubEnv("SYNC_SECRET", "synthetic-sync-secret");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("who may start it", () => {
  it("refuses to run at all with no secret configured", async () => {
    vi.stubEnv("SYNC_SECRET", "");
    const { POST, GET } = await load("money");
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(503);
    expect((await GET(new Request(url))).status).toBe(503);
    expect(seen.rates).toEqual([]);
  });

  it.each([
    ["no secret", {}],
    ["a wrong secret", { "x-sync-secret": "wrong" }],
    ["a secret of another length", { "x-sync-secret": "synthetic-sync-secret-and-more" }],
    ["a wrong bearer", { authorization: "Bearer wrong" }],
  ])("refuses %s", async (_, headers) => {
    const { POST } = await load("money");
    expect((await POST(new Request(url, { method: "POST", headers }))).status).toBe(401);
    expect(seen.rates).toEqual([]);
  });

  it("the home copy's scheduler keeps working: POST with the header or the address", async () => {
    const { POST } = await load("full");
    expect((await POST(new Request(url, { method: "POST", headers: { "x-sync-secret": "synthetic-sync-secret" } }))).status).toBe(200);
    expect((await POST(new Request(`${url}?secret=synthetic-sync-secret`, { method: "POST" }))).status).toBe(200);
  });

  it("the host's scheduler calls GET with its bearer", async () => {
    vi.stubEnv("SYNC_SECRET", "");
    vi.stubEnv("CRON_SECRET", "synthetic-cron-secret");
    const { GET } = await load("money");
    expect((await GET(new Request(url, { headers: { authorization: "Bearer synthetic-cron-secret" } }))).status).toBe(200);
    expect(seen.rates).toEqual(["owner", "ana"]);
  });

  it("a plain link cannot start it: GET ignores a secret in the address and the sync header", async () => {
    const { GET } = await load("money");
    expect((await GET(new Request(`${url}?secret=synthetic-sync-secret`))).status).toBe(401);
    expect((await GET(new Request(url, { headers: { "x-sync-secret": "synthetic-sync-secret" } }))).status).toBe(401);
    expect(seen.rates).toEqual([]);
  });
});

describe("what it does for whom", () => {
  const run = async (edition: string) => {
    const { POST } = await load(edition);
    return POST(new Request(url, { method: "POST", headers: { "x-sync-secret": "synthetic-sync-secret" } }));
  };

  it("in the launch edition: rates for everyone, investments only for the owner", async () => {
    const response = await run("money");
    expect(response.status).toBe(200);
    expect(seen.rates).toEqual(["owner", "ana"]);
    expect(seen.prices).toEqual(["owner"]);
    expect(seen.connections).toEqual(["owner"]);
    expect(await response.json()).toMatchObject({ accounts: 2, fxUpdated: 2, pricesAttempted: 2, pricesUpdated: 1 });
  });

  it("in the full edition: everything for everyone", async () => {
    await run("full");
    expect(seen.prices).toEqual(["owner", "ana"]);
    expect(seen.connections).toEqual(["owner", "ana"]);
  });
});

describe("the edition check inside a scheduled run", () => {
  it("follows the person being worked for, not the absence of a cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRODUCT_EDITION", "money");
    vi.resetModules();
    const { asUser } = await import("@/db/acting");
    const { currentInvestments, requireInvestments } = await import("@/actions/releaseEdition");
    expect(await currentInvestments()).toBe(false);
    expect(await asUser("owner", currentInvestments)).toBe(true);
    expect(await asUser("ana", currentInvestments)).toBe(false);
    await expect(asUser("ana", requireInvestments)).rejects.toThrow("not available");
  });
});
