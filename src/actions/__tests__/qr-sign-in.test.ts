import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { newSessionValue, readSession, SESSION_COOKIE_NAME } from "@/lib/auth";

const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, jar: new Map<string, string>() }));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; } }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => isolated.jar.has(key) ? { value: isolated.jar.get(key) } : undefined,
  set: (key: string, value: string) => isolated.jar.set(key, value),
  delete: (key: string) => isolated.jar.delete(key),
}) }));
import { approveQrSignIn, cancelQrSignIn, consumeQrSignIn, createQrSignIn, qrApprover } from "../qrSignIn";

let engine: PGlite;
beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "isolated-test-secret-which-is-never-used-outside-tests");
  engine = new PGlite(); isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
  await isolated.db.insert(schema.users).values([{ id: "testera", email: "a@example.test" }, { id: "testerb", email: "b@example.test" }]);
}, 60_000);
afterAll(async () => { await engine?.close(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  isolated.jar.clear();
  await isolated.db.delete(schema.qrSignIns);
  await isolated.db.update(schema.users).set({ sessionsNotBefore: null });
});
async function request() {
  const row = await createQrSignIn();
  if (row.kind !== "created") throw new Error("test setup failed");
  return row;
}
async function signIn(id = "testera") {
  isolated.jar.set(SESSION_COOKIE_NAME, await newSessionValue(id, new Date(Date.now() - 60_000)));
}
describe("QR sign-in with real migrations and PostgreSQL", () => {
  it("requires explicit signed-in approval and the separate requesting cookie", async () => {
    const r = await request();
    expect(await consumeQrSignIn(r.id)).toBe("pending");
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("sign-in");
    await signIn();
    expect(await qrApprover()).toEqual({ email: "a@example.test" });
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("approved");
    isolated.jar.delete(SESSION_COOKIE_NAME);
    expect(await consumeQrSignIn(r.id)).toBe("ok");
    expect(await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).toMatchObject({ valid: true, userId: "testera" });
    expect(await consumeQrSignIn(r.id)).toBe("expired");
  });
  it("QR approval token cannot be exchanged for a session", async () => {
    const r = await request(); await signIn(); await approveQrSignIn(r.id, r.approval, r.code);
    isolated.jar.set("moneyos_qr_request", r.approval);
    isolated.jar.delete(SESSION_COOKIE_NAME);
    expect(await consumeQrSignIn(r.id)).toBe("expired");
    expect(isolated.jar.has(SESSION_COOKIE_NAME)).toBe(false);
  });
  it("does not store plaintext capabilities or the confirmation number", async () => {
    const r = await request();
    const [stored] = await isolated.db.select().from(schema.qrSignIns);
    expect(stored.approvalHash).not.toBe(r.approval);
    expect(stored.requesterHash).not.toBe(isolated.jar.get("moneyos_qr_request"));
    expect(stored.codeHash).not.toBe(r.code);
  });
  it("expires approval and consumption", async () => {
    const r = await request(); await signIn();
    await isolated.db.update(schema.qrSignIns).set({ expiresAt: new Date(0) });
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("invalid");
    expect(await consumeQrSignIn(r.id)).toBe("expired");
  });
  it("rejects bad tokens without consuming guesses and caps wrong numbers at five", async () => {
    const r = await request(); await signIn();
    expect(await approveQrSignIn(r.id, "0".repeat(64), r.code)).toBe("invalid");
    for (let i = 0; i < 5; i++) expect(await approveQrSignIn(r.id, r.approval, "000000")).toBe("invalid");
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("invalid");
    expect(await consumeQrSignIn(r.id)).toBe("expired");
  });
  it("cannot overwrite an approval with a different account", async () => {
    const r = await request(); await signIn();
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("approved");
    await signIn("testerb");
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("invalid");
    expect(await consumeQrSignIn(r.id)).toBe("ok");
    expect(await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).toMatchObject({ userId: "testera" });
  });
  it("consumes an approved request only once under concurrent polling", async () => {
    const r = await request(); await signIn(); await approveQrSignIn(r.id, r.approval, r.code);
    expect((await Promise.all([consumeQrSignIn(r.id), consumeQrSignIn(r.id)])).sort()).toEqual(["expired", "ok"]);
  });
  it("refuses a revoked approver even without the proxy", async () => {
    const r = await request(); await signIn();
    await isolated.db.update(schema.users).set({ sessionsNotBefore: new Date() }).where(eq(schema.users.id, "testera"));
    expect(await qrApprover()).toBeNull();
    expect(await approveQrSignIn(r.id, r.approval, r.code)).toBe("sign-in");
  });
  it("revocation between approval and consumption prevents sign-in", async () => {
    const r = await request(); await signIn(); await approveQrSignIn(r.id, r.approval, r.code);
    isolated.jar.delete(SESSION_COOKIE_NAME);
    await isolated.db.update(schema.users).set({ sessionsNotBefore: new Date() }).where(eq(schema.users.id, "testera"));
    expect(await consumeQrSignIn(r.id)).toBe("expired");
    expect(isolated.jar.has(SESSION_COOKIE_NAME)).toBe(false);
  });
  it("rotation and cancellation invalidate the previous request", async () => {
    const old = await request(); const next = await request(); await signIn();
    expect(await approveQrSignIn(old.id, old.approval, old.code)).toBe("invalid");
    await cancelQrSignIn();
    expect(await approveQrSignIn(next.id, next.approval, next.code)).toBe("invalid");
    expect(await consumeQrSignIn(next.id)).toBe("expired");
  });
  it("bounds anonymous storage and clears expired rows before admitting another request", async () => {
    await isolated.db.insert(schema.qrSignIns).values(Array.from({ length: 500 }, (_, i) => ({
      id: `synthetic-${i}`, requesterHash: "synthetic", approvalHash: "synthetic", codeHash: "synthetic", expiresAt: new Date(Date.now() + 60_000),
    })));
    expect(await createQrSignIn()).toEqual({ kind: "busy" });
    await isolated.db.update(schema.qrSignIns).set({ expiresAt: new Date(0) });
    expect((await createQrSignIn()).kind).toBe("created");
    expect(await isolated.db.select().from(schema.qrSignIns)).toHaveLength(1);
  });
  it("deleting the approving account removes its outstanding approval", async () => {
    await isolated.db.insert(schema.users).values({ id: "temporary", email: "temporary@example.test" });
    const r = await request(); await signIn("temporary"); await approveQrSignIn(r.id, r.approval, r.code);
    await isolated.db.delete(schema.users).where(eq(schema.users.id, "temporary"));
    isolated.jar.delete(SESSION_COOKIE_NAME);
    expect(await consumeQrSignIn(r.id)).toBe("expired");
  });
});
