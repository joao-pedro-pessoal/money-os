import { beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ valid: true, userId: "tester", notBefore: null as Date | null, exists: true, fail: false, configured: "", lookups: 0, cookieReads: 0 }));
const client = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { async connect() { return client; } end() {} } }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: (pool: { connect(): Promise<unknown> }) => ({ acquire: () => pool.connect() }) }));
vi.mock("next/headers", () => ({ cookies: async () => { identity.cookieReads++; return { get: () => ({ value: "synthetic-cookie" }) }; } }));
vi.mock("@/lib/auth", async (original) => ({ ...await original<typeof import("@/lib/auth")>(),
  readSession: async () => identity.valid ? { valid: true, userId: identity.userId, issuedAt: new Date("2026-11-11T12:00:00Z") } : { valid: false },
}));

beforeEach(() => {
  vi.resetModules();
  identity.valid = true; identity.userId = "tester"; identity.notBefore = null; identity.exists = true; identity.fail = false;
  identity.configured = ""; identity.lookups = 0; identity.cookieReads = 0;
  client.query.mockReset(); client.release.mockReset();
  client.query.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("rolbypassrls")) return { rows: [{ bypass: false }] };
    if (/from users\b/i.test(sql)) {
      identity.lookups++;
      expect(values).toEqual([identity.userId]);
      if (identity.fail) throw new Error("synthetic revocation lookup failure");
      return { rows: identity.exists ? [{ notBefore: identity.notBefore }] : [] };
    }
    if (sql.includes("set_config")) identity.configured = String(values?.[0]);
    return { rows: [] };
  });
});

async function acquire() {
  const { db } = await import("@/db/client");
  await (db as unknown as { acquire(): Promise<unknown> }).acquire();
}

describe("a signed cookie is not enough to select the database identity", () => {
  it("refuses a revoked cookie even when the action did not check it", async () => {
    identity.notBefore = new Date("2026-11-11T12:00:01Z");
    await acquire();
    expect(identity.configured).toBe("");
    expect(identity.lookups).toBe(1);
  });
  it("refuses an account that has been deleted", async () => {
    identity.exists = false;
    await acquire();
    expect(identity.configured).toBe("");
    expect(identity.lookups).toBe(1);
  });
  it("rechecks revocation when the same physical connection is reused", async () => {
    await acquire();
    expect(identity.configured).toBe("tester");
    identity.notBefore = new Date("2026-11-11T12:00:01Z");
    await acquire();
    expect(identity.configured).toBe("");
    expect(identity.lookups).toBe(2);
  });
  it("accepts an existing unrevoked account", async () => {
    await acquire();
    expect(identity.configured).toBe("tester");
    expect(identity.lookups).toBe(1);
  });
  it("does not consult a person's revocation for an invalid cookie", async () => {
    identity.valid = false;
    await acquire();
    expect(identity.configured).toBe("");
    expect(identity.lookups).toBe(0);
  });
  it("preserves explicit server work without reading browser cookies", async () => {
    const { asUser } = await import("@/db/client");
    await asUser("scheduler-person", acquire);
    expect(identity.configured).toBe("scheduler-person");
    expect(identity.cookieReads).toBe(0);
  });
  it("does not execute work as the user if the revocation check fails", async () => {
    identity.fail = true;
    await expect(acquire()).rejects.toThrow("synthetic revocation lookup failure");
    expect(identity.configured).toBe("");
    expect(client.release).toHaveBeenCalled();
  });
});
