import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { newSessionValue, readSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { GOOGLE_COOKIE, GOOGLE_ISSUER } from "@/lib/accounts/google";
import { recoveryHashOf, signInKeyFor } from "@/lib/accounts/credentials";

const isolated = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, jar: new Map<string, string>(),
  current: null as string | null, identity: { subject: "googlea", email: "a@example.test" }, admitted: true, bot: null as string | null,
  passwordRace: null as (() => Promise<void>) | null,
}));
vi.mock("@/db/client", () => ({ get db() { return isolated.db; }, asUser: async (id: string, work: () => Promise<void>) => {
  await isolated.db.execute(sql`select set_config('app.user_id', ${id}, false)`); return work();
} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => isolated.jar.has(key) ? { value: isolated.jar.get(key) } : undefined,
  set: (key: string, value: string) => isolated.jar.set(key, value), delete: (key: string) => isolated.jar.delete(key) }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ currentUserId: async () => isolated.current, hasSession: async () => !!isolated.current }));
vi.mock("../attemptGate", () => ({ admitted: async () => isolated.admitted }));
vi.mock("../registrationBot", () => ({ registrationBotRefusal: async () => isolated.bot }));
vi.mock("../fx", () => ({ refreshRates: async () => undefined }));
vi.mock("../googleProvider", () => ({ googleAuthorizationUrl: async (_settings: unknown, state: string) => "https://accounts.google.com/auth?state=" + state,
  googleCodeIdentity: async () => isolated.identity, googleNativeIdentity: async () => isolated.identity }));
vi.mock("@/lib/accounts/password", () => ({ PASSWORD_MAX: 512, needsRehash: () => false, hashPassword: async () => "synthetic-new-hash", verifyPassword: async (key: string) => {
  const race = isolated.passwordRace; isolated.passwordRace = null; await race?.(); return key === "a".repeat(64);
} }));
import { cancelGoogleRequest, completeGoogle, googleAccountState, googleCallback, nativeGoogle, pendingGoogleRegistration, registerGoogle, startGoogle, withGoogleConfirmation } from "../googleFlow";
import { deleteAccount, recoverAccount, replaceRecoveryCode, signIn, signUp } from "../auth";
import { disconnectGoogle, setGooglePassword } from "../googleSettings";

let engine: PGlite;
const verifier = "b".repeat(64), key = "a".repeat(64), recovery = "abcde-fghjk-mnpqr-stuvw";
const challenge = createHash("sha256").update(verifier).digest("hex");
const person = async (id = "persona") => (await isolated.db.select().from(schema.users).where(eq(schema.users.id, id)))[0];
async function signedIn(id = "persona") {
  isolated.current = id;
  isolated.jar.set(SESSION_COOKIE_NAME, await newSessionValue(id, new Date(Date.now() - 10000)));
}
async function linked(id = "persona", subject = "googlea") {
  await isolated.db.insert(schema.authIdentities).values({ userId: id, issuer: GOOGLE_ISSUER, subject, email: "a@example.test" });
}
async function request(intent: "login" | "link" | "confirm" = "login", purpose?: "delete" | "recovery-code" | "set-password") {
  const result = await startGoogle({ mode: "native", challenge, intent, ...(intent === "link" ? { signInKey: key } : {}), ...(purpose ? { purpose } : {}) });
  if (!("id" in result) || typeof result.id !== "string") throw new Error("Missing request id");
  return result.id;
}
async function proof(id: string) { await nativeGoogle({ id, verifier, token: "synthetic-id-token" }); }
async function confirm(purpose: "delete" | "recovery-code" | "set-password") {
  const id = await request("confirm", purpose); await proof(id); await completeGoogle(verifier, id);
}
beforeAll(async () => {
  engine = new PGlite(); isolated.db = drizzle(engine, { schema });
  await migrate(isolated.db, { migrationsFolder: "./drizzle" });
}, 60000);
afterAll(async () => { await engine?.close(); });
beforeEach(async () => {
  vi.stubEnv("APP_SECRET", "synthetic-google-test-secret"); vi.stubEnv("APP_EMAIL", "owner@example.test");
  vi.stubEnv("GOOGLE_LOGIN_ENABLED", "true"); vi.stubEnv("GOOGLE_AUTH_ORIGIN", "https://money.example.test");
  vi.stubEnv("GOOGLE_CLIENT_ID", "web.apps.googleusercontent.com"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-secret");
  vi.stubEnv("GOOGLE_ANDROID_CLIENT_IDS", "android.apps.googleusercontent.com"); vi.stubEnv("REGISTRATION_MODE", "open"); vi.stubEnv("MAX_ACCOUNTS", "100");
  await isolated.db.delete(schema.googleAuthRequests); await isolated.db.delete(schema.users);
  await isolated.db.insert(schema.users).values([{ id: "owner", email: "owner@example.test" },
    { id: "persona", email: "a@example.test", passwordHash: "synthetic-hash", recoveryHash: recoveryHashOf(recovery) },
    { id: "personb", email: "b@example.test", passwordHash: "synthetic-hash" }]);
  await engine.exec("select set_config('app.user_id','persona',false)");
  isolated.current = null; isolated.jar.clear(); isolated.identity = { subject: "googlea", email: "a@example.test" };
  isolated.admitted = true; isolated.bot = null; isolated.passwordRace = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("Google authentication with real migrations and PostgreSQL", () => {
  it("is disabled by default, even when credentials exist", async () => {
    vi.stubEnv("GOOGLE_LOGIN_ENABLED", ""); await expect(request()).rejects.toThrow("unavailable");
    expect(await isolated.db.select().from(schema.googleAuthRequests)).toHaveLength(0);
  });
  it("does not issue a session when a native challenge is fetched or a token is verified", async () => {
    await linked(); const id = await request();
    expect(await nativeGoogle({ id, verifier })).toMatchObject({ clientId: "web.apps.googleusercontent.com" });
    await proof(id); expect(isolated.jar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await completeGoogle(verifier, id)).toBe("/");
    expect(await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).toMatchObject({ valid: true, userId: "persona" });
  });
  it("does not match an existing account by email", async () => {
    const id = await request(); await proof(id);
    expect(await completeGoogle(verifier, id)).toBe("/login/google");
    expect(await pendingGoogleRegistration()).toMatchObject({ taken: true });
    await expect(registerGoogle({})).rejects.toThrow("existing method");
    expect(isolated.jar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await isolated.db.select().from(schema.authIdentities)).toHaveLength(0);
  });
  it("uses stable subject after Google changes its email", async () => {
    await linked(); isolated.identity.email = "changed@example.test";
    const id = await request(); await proof(id); await completeGoogle(verifier, id);
    expect((await person()).email).toBe("a@example.test");
    expect(await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).toMatchObject({ userId: "persona" });
  });
  it("binds native verification to both the browser and its separate native proof", async () => {
    const id = await request();
    await expect(nativeGoogle({ id, verifier: "c".repeat(64) })).rejects.toThrow("expired");
    const cookie = isolated.jar.get(GOOGLE_COOKIE)!;
    isolated.jar.set(GOOGLE_COOKIE, cookie.split(".")[0] + "." + "c".repeat(64));
    await expect(nativeGoogle({ id, verifier })).rejects.toThrow("expired");
    isolated.jar.set(GOOGLE_COOKIE, cookie); await proof(id);
    await expect(completeGoogle(undefined, id)).rejects.toThrow("expired");
    await expect(completeGoogle(verifier, "d".repeat(64))).rejects.toThrow("expired");
  });
  it("consumes a successful login once under concurrent completion", async () => {
    await linked(); const id = await request(); await proof(id);
    const results = await Promise.allSettled([completeGoogle(verifier, id), completeGoogle(verifier, id)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
  });
  it("rejects replayed Google proofs", async () => {
    const id = await request(); await proof(id); await expect(proof(id)).rejects.toThrow("expired");
  });
  it("rejects expired pending and verified requests", async () => {
    const id = await request(); await proof(id);
    await isolated.db.update(schema.googleAuthRequests).set({ verifiedAt: new Date(Date.now() - 61000) });
    await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
    await isolated.db.update(schema.googleAuthRequests).set({ expiresAt: new Date(0) });
    await expect(nativeGoogle({ id, verifier })).rejects.toThrow("expired");
  });
  it("cannot finish a pending login after session revocation", async () => {
    await linked(); const id = await request(); await proof(id);
    await isolated.db.update(schema.users).set({ sessionsNotBefore: new Date(Date.now() + 1) }).where(eq(schema.users.id, "persona"));
    await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
  });
  it("cannot overwrite a session established while Google was pending", async () => {
    await linked(); const id = await request(); await proof(id); await signedIn("personb");
    await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
    expect(await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).toMatchObject({ userId: "personb" });
  });
  it("requires current password before linking and binds the target to the initiating session", async () => {
    await signedIn(); await expect(startGoogle({ mode: "native", challenge, intent: "link" })).rejects.toThrow("password");
    const id = await request("link"); await proof(id); await signedIn("personb");
    await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
  });
  it("links without moving the account or financial records and revokes older sessions", async () => {
    await signedIn(); const old = isolated.jar.get(SESSION_COOKIE_NAME)!;
    await isolated.db.insert(schema.categories).values({ name: "Own category", kind: "income" });
    const id = await request("link"); await proof(id); await completeGoogle(verifier, id);
    expect((await isolated.db.select().from(schema.authIdentities))[0].userId).toBe("persona");
    expect((await isolated.db.select().from(schema.categories))[0].userId).toBe("persona");
    expect((await person()).authVersion).toBe(1);
    const prior = await readSession(old); expect(prior.valid && (await person()).sessionsNotBefore! > prior.issuedAt).toBe(true);
  });
  it("never transfers an identity from another account", async () => {
    await linked("personb"); await signedIn(); const id = await request("link"); await proof(id);
    await expect(completeGoogle(verifier, id)).rejects.toThrow("already linked");
    expect((await isolated.db.select().from(schema.authIdentities))[0].userId).toBe("personb");
  });
  it("a recovery during password verification prevents linking", async () => {
    await signedIn(); isolated.passwordRace = async () => { await isolated.db.update(schema.users).set({ authVersion: 1, sessionsNotBefore: new Date(Date.now() + 1) }).where(eq(schema.users.id, "persona")); };
    const id = await request("link"); await proof(id); await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
  });
  it("creates a passwordless account only after explicit registration and gives a recovery code", async () => {
    isolated.identity = { subject: "newgoogle", email: "new@example.test" };
    const id = await request(); await proof(id); await completeGoogle(verifier, id);
    expect((await isolated.db.select().from(schema.users))).toHaveLength(3);
    const result = await registerGoogle({});
    const [user] = await isolated.db.select().from(schema.users).where(eq(schema.users.email, "new@example.test"));
    expect(user.passwordHash).toBeNull(); expect(user.recoveryHash).toBe(recoveryHashOf(result.recoveryCode));
    expect((await isolated.db.select().from(schema.authIdentities))[0].userId).toBe(user.id);
    expect(await readSession(isolated.jar.get(SESSION_COOKIE_NAME))).toMatchObject({ valid: true, userId: user.id });
  });
  it.each(["closed", "invite"])("Google signup respects registration mode %s", async mode => {
    isolated.identity.email = "new@example.test"; const id = await request(); await proof(id); await completeGoogle(verifier, id);
    vi.stubEnv("REGISTRATION_MODE", mode); await expect(registerGoogle({})).rejects.toThrow();
    expect(await isolated.db.select().from(schema.users)).toHaveLength(3);
  });
  it("Google and password signup share the final site capacity gate", async () => {
    isolated.identity.email = "new@example.test"; const id = await request(); await proof(id); await completeGoogle(verifier, id);
    vi.stubEnv("MAX_ACCOUNTS", "3"); await expect(registerGoogle({})).rejects.toThrow("not taking new accounts");
    expect(await signUp({ email: "password@example.test", signInKey: key })).toMatchObject({ kind: "refused" });
  });
  it("Google signup refuses failed BotID and filled honeypots", async () => {
    isolated.identity.email = "new@example.test"; const id = await request(); await proof(id); await completeGoogle(verifier, id);
    isolated.bot = "Synthetic BotID refusal"; await expect(registerGoogle({})).rejects.toThrow("BotID");
    isolated.bot = null; await expect(registerGoogle({ website: "robot" })).rejects.toThrow();
    expect(await isolated.db.select().from(schema.users)).toHaveLength(3);
  });
  it("allows time to read registration terms without extending the proof into a login", async () => {
    isolated.identity = { subject: "newgoogle", email: "new@example.test" };
    const id = await request(); await proof(id); await completeGoogle(verifier, id);
    await isolated.db.update(schema.googleAuthRequests).set({ createdAt: new Date(Date.now() - 120000), verifiedAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() + 180000) });
    expect(await pendingGoogleRegistration()).toMatchObject({ email: "new@example.test", taken: false });
    await expect(completeGoogle()).rejects.toThrow("expired");
    expect(await registerGoogle({})).toMatchObject({ kind: "ok" });
  });
  it("reserves the owner's address even for Google", async () => {
    isolated.identity.email = "owner@example.test"; const id = await request(); await proof(id); await completeGoogle(verifier, id);
    await expect(registerGoogle({})).rejects.toThrow("existing method"); expect((await person("owner")).passwordHash).toBeNull();
  });
  it("a new Google proof must belong to the linked subject and exact sensitive operation", async () => {
    await signedIn(); await linked(); isolated.identity.subject = "anothergoogle";
    const id = await request("confirm", "delete"); await proof(id); await expect(completeGoogle(verifier, id)).rejects.toThrow("verify");
    isolated.identity.subject = "googlea"; await confirm("delete");
    await expect(withGoogleConfirmation("recovery-code", async () => true)).rejects.toThrow("expired");
    expect(await withGoogleConfirmation("delete", async () => true)).toBe(true);
    await expect(withGoogleConfirmation("delete", async () => true)).rejects.toThrow("expired");
  });
  it("passwordless recovery-code replacement needs a new Google proof", async () => {
    await isolated.db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, "persona"));
    await signedIn(); await linked(); expect(await replaceRecoveryCode({})).toMatchObject({ kind: "refused" });
    await confirm("recovery-code"); expect(await replaceRecoveryCode({})).toMatchObject({ kind: "ok" });
  });
  it("passwordless deletion needs its own proof and cascades the identity", async () => {
    await isolated.db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, "persona"));
    await signedIn(); await linked(); expect(await deleteAccount({ confirmEmail: "a@example.test" })).toMatchObject({ kind: "refused" });
    await confirm("delete"); expect(await deleteAccount({ confirmEmail: "a@example.test" })).toEqual({ kind: "deleted" });
    expect(await person()).toBeUndefined(); expect(await isolated.db.select().from(schema.authIdentities)).toHaveLength(0);
  });
  it("recovery suspends Google, rotates the code and invalidates prior proofs", async () => {
    await linked(); await signedIn(); await confirm("delete");
    expect(await recoverAccount({ email: "a@example.test", recoveryCode: recovery, signInKey: key })).toMatchObject({ kind: "ok" });
    expect((await isolated.db.select().from(schema.authIdentities))[0].enabled).toBe(false);
    await expect(withGoogleConfirmation("delete", async () => true)).rejects.toThrow("expired");
    isolated.current = null; isolated.jar.delete(SESSION_COOKIE_NAME);
    const id = await request(); await proof(id); await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
  });
  it("cannot disconnect the last sign-in method", async () => {
    await isolated.db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, "persona"));
    await signedIn(); await linked(); expect(await disconnectGoogle({ signInKey: key })).toMatchObject({ kind: "refused" });
    expect(await isolated.db.select().from(schema.authIdentities)).toHaveLength(1);
  });
  it("sets a password with one Google proof, then permits safe disconnection", async () => {
    await isolated.db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, "persona"));
    await signedIn(); await linked(); expect(await setGooglePassword({ signInKey: key })).toMatchObject({ kind: "refused" });
    await confirm("set-password"); expect(await setGooglePassword({ signInKey: key })).toEqual({ kind: "ok" });
    expect((await person()).passwordKind).toBe("keyed");
    expect(await disconnectGoogle({ signInKey: key })).toEqual({ kind: "ok" });
    expect(await isolated.db.select().from(schema.authIdentities)).toHaveLength(0);
  });
  it("password lockouts do not let guessed emails lock out valid Google identities", async () => {
    await linked(); await isolated.db.update(schema.users).set({ lockedUntil: new Date(Date.now() + 60000) }).where(eq(schema.users.id, "persona"));
    const id = await request(); await proof(id); await expect(completeGoogle(verifier, id)).resolves.toBe("/");
  });
  it("applies endpoint quotas before provider work", async () => {
    isolated.admitted = false; await expect(request()).rejects.toThrow("Too many");
    expect(await isolated.db.select().from(schema.googleAuthRequests)).toHaveLength(0);
  });
  it("linking cannot bypass password failure counters and account lockouts", async () => {
    await signedIn();
    for (let i = 0; i < 10; i++) await expect(startGoogle({ mode: "native", challenge, intent: "link", signInKey: "c".repeat(64) })).rejects.toThrow("password");
    expect((await person()).lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    await expect(request("link")).rejects.toThrow("password");
  });
  it("explicit logout cancels the initiating browser's pending Google request", async () => {
    await linked(); const id = await request(); await proof(id);
    await cancelGoogleRequest(); await expect(completeGoogle(verifier, id)).rejects.toThrow("expired");
    expect(await isolated.db.select().from(schema.googleAuthRequests)).toHaveLength(0);
  });
  it("legacy owner activation never deletes an existing account with the same email", async () => {
    await linked(); vi.stubEnv("APP_EMAIL", "a@example.test"); vi.stubEnv("APP_PASSWORD", "synthetic-owner-password");
    const ownerKey = await signInKeyFor("a@example.test", "synthetic-owner-password");
    expect(await signIn({ email: "a@example.test", signInKey: ownerKey })).toEqual({ kind: "wrong" });
    expect((await person()).id).toBe("persona"); expect((await person("owner")).passwordHash).toBeNull();
    expect(await isolated.db.select().from(schema.authIdentities)).toHaveLength(1);
  });
  it("rejects a web callback with the wrong state or missing browser cookie", async () => {
    await startGoogle({ mode: "web", intent: "login" });
    await expect(googleCallback(new URL("https://money.example.test/api/auth/google/callback?state=" + "f".repeat(64)))).rejects.toThrow("expired");
    isolated.jar.delete(GOOGLE_COOKIE); await expect(googleCallback(new URL("https://money.example.test/api/auth/google/callback?state=x"))).rejects.toThrow("expired");
  });
  it("reports only the signed-in account's method state", async () => {
    await linked(); expect(await googleAccountState()).toMatchObject({ enabled: false, linked: false });
    await signedIn(); expect(await googleAccountState()).toMatchObject({ linked: true, email: "a@example.test", hasPassword: true });
    await signedIn("personb"); expect(await googleAccountState()).toMatchObject({ linked: false, email: null });
  });
});
