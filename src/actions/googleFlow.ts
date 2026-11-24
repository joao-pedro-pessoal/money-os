// Internal authentication protocol. No "use server": helpers must not be endpoints.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, asUser } from "@/db/client";
import { authIdentities, googleAuthRequests, users } from "@/db/schema";
import { endedBy, newSessionValue, readSession, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";
import { KEY_HEX, newRecoveryCode, recoveryHashOf } from "@/lib/accounts/credentials";
import { accountHashes as hashes, countFailure } from "./passwordWork";
import { lockedUntil } from "@/lib/accounts/limits";
import { verifyPassword } from "@/lib/accounts/password";
import { registrationAccess } from "@/lib/accounts/registration";
import { safeReturnPath } from "@/lib/accounts/returnPath";
import { GOOGLE_COOKIE, GOOGLE_ERRORS, GOOGLE_ISSUER, GOOGLE_PURPOSES, GOOGLE_TOKEN, GOOGLE_TTL_SECONDS, googleConfiguration, googleProofFresh, type GooglePurpose, type GoogleAccountState } from "@/lib/accounts/google";
import { admitted } from "./attemptGate";
import { currentUserId } from "./session";
import { googleAuthorizationUrl, googleCodeIdentity, googleNativeIdentity, type GoogleIdentity } from "./googleProvider";
import { ensureStartingData, insertRegisteredUser, type AuthTransaction } from "./accountProvisioning";
import { registrationBotRefusal } from "./registrationBot";

type Pending = typeof googleAuthRequests.$inferSelect;
type Person = typeof users.$inferSelect;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("hex");
const Start = z.object({ mode: z.enum(["web", "native"]), intent: z.enum(["login", "link", "confirm"]), purpose: z.enum(GOOGLE_PURPOSES).optional(), challenge: z.string().regex(GOOGLE_TOKEN).optional(), signInKey: z.string().regex(KEY_HEX).optional(), destination: z.string().max(2048).optional() }).strict();
const Native = z.object({ id: z.string().regex(GOOGLE_TOKEN), verifier: z.string().regex(GOOGLE_TOKEN), token: z.string().min(1).max(12000).optional() }).strict();

export function configuredGoogle() {
  const settings = googleConfiguration(process.env);
  if (!settings) throw new Error(GOOGLE_ERRORS.unavailable);
  return settings;
}

export async function googlePasswordMatches(key: string | undefined, user: Person): Promise<boolean> {
  if (!key || !user.passwordHash || lockedUntil(user, new Date())) return false;
  const checked = await hashes.run(() => verifyPassword(key, user.passwordHash!));
  if (checked.ok && !checked.value) await countFailure(user.id, new Date());
  return checked.ok && checked.value;
}

async function requester() {
  const jar = await cookies();
  const parts = jar.get(GOOGLE_COOKIE)?.value.split(".") ?? [];
  if (parts.length !== 2 || !parts.every(part => GOOGLE_TOKEN.test(part))) throw new Error(GOOGLE_ERRORS.expired);
  return { id: parts[0], secret: parts[1], jar };
}

function pkce(id: string, secret: string): string {
  const key = process.env.APP_SECRET;
  if (!key) throw new Error(GOOGLE_ERRORS.unavailable);
  return createHmac("sha256", key).update(`google-pkce|${id}|${secret}`).digest("hex");
}

function nativeProof(request: Pending, verifier?: string): boolean {
  if (request.mode === "web") return verifier === undefined;
  if (!verifier || !GOOGLE_TOKEN.test(verifier) || !request.nativeChallenge) return false;
  return timingSafeEqual(Buffer.from(digest(verifier), "hex"), Buffer.from(request.nativeChallenge, "hex"));
}

async function boundRequest(tx: AuthTransaction, id?: string, verifier?: string, lock = false): Promise<Pending> {
  const browser = await requester();
  if (id !== undefined && id !== browser.id) throw new Error(GOOGLE_ERRORS.expired);
  const query = tx.select().from(googleAuthRequests).where(and(eq(googleAuthRequests.id, browser.id), eq(googleAuthRequests.browserHash, digest(browser.secret))));
  const [row] = await (lock ? query.for("update") : query);
  if (!row || row.expiresAt <= new Date() || !nativeProof(row, verifier)) throw new Error(GOOGLE_ERRORS.expired);
  return row;
}

async function target(tx: AuthTransaction, request: Pending): Promise<Person> {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!session || digest(session) !== request.sessionHash || !request.targetUserId) throw new Error(GOOGLE_ERRORS.expired);
  const parsed = await readSession(session);
  const [user] = await tx.select().from(users).where(eq(users.id, request.targetUserId)).for("update");
  if (!user || !parsed.valid || parsed.userId !== user.id || endedBy(user.sessionsNotBefore, parsed.issuedAt)
    || endedBy(user.sessionsNotBefore, request.createdAt) || user.authVersion !== request.targetVersion) throw new Error(GOOGLE_ERRORS.expired);
  return user;
}

export async function startGoogle(raw: unknown) {
  const settings = configuredGoogle();
  const input = Start.parse(raw);
  if (!(await admitted("google"))) throw new Error("Too many attempts. Try again later.");
  if (input.mode === "native" && (!input.challenge || !settings.androidClients.length || !settings.origin.startsWith("https://"))) throw new Error(GOOGLE_ERRORS.unavailable);
  if (input.mode === "web" && input.challenge !== undefined || input.intent !== "confirm" && input.purpose !== undefined || input.intent === "confirm" && !input.purpose) throw new Error(GOOGLE_ERRORS.failed);
  const jar = await cookies();
  const userId = await currentUserId();
  let user: Person | undefined;
  if (input.intent === "login") {
    if (userId) throw new Error("Log out before signing into another account, or link Google in Settings.");
  } else {
    if (!userId) throw new Error("Sign in again.");
    [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error("Sign in again.");
    if (input.intent === "link" && !(await googlePasswordMatches(input.signInKey, user))) throw new Error(GOOGLE_ERRORS.password);
    if (input.intent === "confirm") {
      const [identity] = await db.select().from(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.issuer, GOOGLE_ISSUER), eq(authIdentities.enabled, true)));
      if (!identity) throw new Error(GOOGLE_ERRORS.failed);
    }
  }
  const id = random(), secret = random(), nonce = random(), now = new Date();
  const previous = jar.get(GOOGLE_COOKIE)?.value.split(".");
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(1297040207, 3)`);
    await tx.delete(googleAuthRequests).where(lte(googleAuthRequests.expiresAt, now));
    if (previous?.length === 2 && previous.every(x => GOOGLE_TOKEN.test(x))) await tx.delete(googleAuthRequests).where(and(eq(googleAuthRequests.id, previous[0]), eq(googleAuthRequests.browserHash, digest(previous[1]))));
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(googleAuthRequests);
    if (count.n >= 500) throw new Error("Too many pending sign-ins. Try again later.");
    await tx.insert(googleAuthRequests).values({ id, browserHash: digest(secret), nonce, mode: input.mode, nativeChallenge: input.challenge,
      intent: input.intent, purpose: input.purpose, destination: safeReturnPath(input.destination), targetUserId: user?.id,
      targetVersion: user?.authVersion, sessionHash: user ? digest(jar.get(SESSION_COOKIE_NAME)?.value ?? "") : null,
      createdAt: now, expiresAt: new Date(now.getTime() + GOOGLE_TTL_SECONDS * 1000) });
  });
  // WebView.postUrl can be a native-initiated POST with no same-site initiator.
  // Only this five-minute capability cookie needs SameSite=None; the Money OS
  // session keeps Lax. Native completion also requires its separate verifier.
  jar.set(GOOGLE_COOKIE, `${id}.${secret}`, { ...sessionCookieOptions(), ...(input.mode === "native" ? { sameSite: "none" as const, secure: true } : {}), maxAge: GOOGLE_TTL_SECONDS });
  return input.mode === "native" ? { id } : { url: await googleAuthorizationUrl(settings, id, nonce, pkce(id, secret)) };
}

async function recordIdentity(request: Pending, identity: GoogleIdentity) {
  const [recorded] = await db.update(googleAuthRequests).set({ subject: identity.subject, email: identity.email, verifiedAt: new Date() })
    .where(and(eq(googleAuthRequests.id, request.id), isNull(googleAuthRequests.verifiedAt), gt(googleAuthRequests.expiresAt, new Date()))).returning({ id: googleAuthRequests.id });
  if (!recorded) throw new Error(GOOGLE_ERRORS.expired);
}

export async function googleCallback(url: URL) {
  const settings = configuredGoogle();
  if (!(await admitted("google"))) throw new Error(GOOGLE_ERRORS.failed);
  const browser = await requester();
  const request = await db.transaction(tx => boundRequest(tx, url.searchParams.get("state") ?? ""));
  if (request.mode !== "web" || request.verifiedAt) throw new Error(GOOGLE_ERRORS.expired);
  const callback = new URL(settings.origin + "/api/auth/google/callback" + url.search);
  await recordIdentity(request, await googleCodeIdentity(settings, callback, request.id, request.nonce, pkce(request.id, browser.secret)));
  return completeGoogle();
}

export async function nativeGoogle(raw: unknown) {
  const settings = configuredGoogle();
  const input = Native.parse(raw);
  if (!(await admitted("google"))) throw new Error(GOOGLE_ERRORS.failed);
  const request = await db.transaction(tx => boundRequest(tx, input.id, input.verifier));
  if (request.mode !== "native" || request.verifiedAt || !settings.androidClients.length) throw new Error(GOOGLE_ERRORS.expired);
  if (!input.token) return { nonce: request.nonce, clientId: settings.clientId };
  await recordIdentity(request, await googleNativeIdentity(settings, input.token, request.nonce));
  return { ready: true };
}

async function proved(tx: AuthTransaction, verifier?: string) {
  const request = await boundRequest(tx, undefined, verifier, true);
  const now = new Date();
  // After the one-minute handoff, a scoped registration draft can remain until
  // the original five-minute expiry so someone can read the terms/invitation.
  const fresh = request.intent === "register" ? request.verifiedAt !== null && request.verifiedAt <= now : googleProofFresh(request.verifiedAt, request.expiresAt, now);
  if (!request.subject || !request.email || !fresh) throw new Error(GOOGLE_ERRORS.expired);
  return request;
}

async function writeSession(userId: string, issuedAt: Date) {
  (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(userId, issuedAt), sessionCookieOptions());
}

export async function completeGoogle(verifier?: string, id?: string): Promise<string> {
  configuredGoogle();
  if (!(await admitted("google"))) throw new Error(GOOGLE_ERRORS.failed);
  const result = await db.transaction(async tx => {
    const request = await proved(tx, verifier);
    if (id !== undefined && request.id !== id) throw new Error(GOOGLE_ERRORS.expired);
    if (request.intent === "register") throw new Error(GOOGLE_ERRORS.expired);
    if (request.intent === "confirm") {
      const user = await target(tx, request);
      const [identity] = await tx.select().from(authIdentities).where(and(eq(authIdentities.userId, user.id), eq(authIdentities.issuer, GOOGLE_ISSUER), eq(authIdentities.subject, request.subject!), eq(authIdentities.enabled, true)));
      if (!identity) throw new Error(GOOGLE_ERRORS.failed);
      // Keep only the initiating-browser capability after native verification.
      await tx.update(googleAuthRequests).set({ mode: "web", nativeChallenge: null }).where(eq(googleAuthRequests.id, request.id));
      return { destination: "/settings?google=confirmed" };
    }
    if (request.intent === "link") {
      const user = await target(tx, request);
      const [identity] = await tx.select().from(authIdentities).where(and(eq(authIdentities.issuer, GOOGLE_ISSUER), eq(authIdentities.subject, request.subject!)));
      if (identity && identity.userId !== user.id) throw new Error(GOOGLE_ERRORS.linked);
      const [existing] = await tx.select().from(authIdentities).where(and(eq(authIdentities.userId, user.id), eq(authIdentities.issuer, GOOGLE_ISSUER)));
      if (existing && existing.subject !== request.subject) throw new Error(GOOGLE_ERRORS.linked);
      if (existing) await tx.update(authIdentities).set({ enabled: true, email: request.email! }).where(eq(authIdentities.id, existing.id));
      else await tx.insert(authIdentities).values({ userId: user.id, issuer: GOOGLE_ISSUER, subject: request.subject!, email: request.email! });
      const issuedAt = new Date(Date.now() + 1);
      await tx.update(users).set({ authVersion: sql`${users.authVersion} + 1`, sessionsNotBefore: issuedAt, failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
      await tx.delete(googleAuthRequests).where(eq(googleAuthRequests.id, request.id));
      return { userId: user.id, issuedAt, destination: "/settings?google=linked" };
    }
    if (await currentUserId()) throw new Error(GOOGLE_ERRORS.expired);
    const [identity] = await tx.select().from(authIdentities).where(and(eq(authIdentities.issuer, GOOGLE_ISSUER), eq(authIdentities.subject, request.subject!)));
    if (!identity) {
      await tx.update(googleAuthRequests).set({ mode: "web", nativeChallenge: null, intent: "register" }).where(eq(googleAuthRequests.id, request.id));
      return { destination: "/login/google" };
    }
    const [user] = await tx.select().from(users).where(eq(users.id, identity.userId)).for("update");
    // Re-read the identity while holding the same user lock as disconnect/recovery.
    const [stillLinked] = await tx.select().from(authIdentities).where(and(eq(authIdentities.id, identity.id), eq(authIdentities.enabled, true)));
    if (!user || !stillLinked || endedBy(user.sessionsNotBefore, request.createdAt)) throw new Error(GOOGLE_ERRORS.expired);
    await tx.delete(googleAuthRequests).where(eq(googleAuthRequests.id, request.id));
    return { userId: user.id, issuedAt: request.createdAt, destination: request.destination };
  });
  if ("userId" in result && result.userId && result.issuedAt) {
    await writeSession(result.userId, result.issuedAt);
    (await cookies()).delete(GOOGLE_COOKIE);
  }
  return result.destination;
}

export async function pendingGoogleRegistration() {
  if (!googleConfiguration(process.env)) return null;
  try {
    return await db.transaction(async tx => {
      const request = await proved(tx);
      if (request.intent !== "register" || await currentUserId()) return null;
      const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, request.email!));
      return { email: request.email!, taken: !!taken, destination: request.destination };
    });
  } catch { return null; }
}

export async function registerGoogle(raw: unknown) {
  configuredGoogle();
  const input = z.object({ inviteCode: z.string().max(256).optional(), website: z.string().max(200).optional() }).strict().parse(raw);
  if (input.website) throw new Error(GOOGLE_ERRORS.failed);
  const refusal = registrationAccess(process.env, input.inviteCode);
  if (refusal) throw new Error(refusal);
  if (!(await admitted("sign-up"))) throw new Error("Too many attempts. Try again later.");
  const bot = await registrationBotRefusal(); if (bot) throw new Error(bot);
  if (await currentUserId()) throw new Error(GOOGLE_ERRORS.expired);
  const code = newRecoveryCode(n => new Uint8Array(randomBytes(n)));
  const made = await db.transaction(async tx => {
    const request = await proved(tx);
    if (request.intent !== "register") throw new Error(GOOGLE_ERRORS.expired);
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, request.email!));
    if (taken) throw new Error(GOOGLE_ERRORS.conflict);
    const id = await insertRegisteredUser(tx, { email: request.email!, passwordHash: null, passwordKind: "google", recoveryHash: recoveryHashOf(code) });
    await tx.insert(authIdentities).values({ userId: id, issuer: GOOGLE_ISSUER, subject: request.subject!, email: request.email! });
    await tx.delete(googleAuthRequests).where(eq(googleAuthRequests.id, request.id));
    return { id, issuedAt: request.createdAt, destination: request.destination };
  });
  await asUser(made.id, ensureStartingData);
  await writeSession(made.id, made.issuedAt);
  (await cookies()).delete(GOOGLE_COOKIE);
  return { kind: "ok", recoveryCode: code, destination: made.destination };
}

/** A new Google proof confirms one named operation; the Money OS cookie alone cannot. */
export async function withGoogleConfirmation<T>(purpose: GooglePurpose, work: (tx: AuthTransaction, user: Person) => Promise<T>): Promise<T> {
  configuredGoogle();
  const result = await db.transaction(async tx => {
    const request = await proved(tx);
    if (request.intent !== "confirm" || request.purpose !== purpose) throw new Error(GOOGLE_ERRORS.expired);
    const user = await target(tx, request);
    const [identity] = await tx.select().from(authIdentities).where(and(eq(authIdentities.userId, user.id), eq(authIdentities.issuer, GOOGLE_ISSUER), eq(authIdentities.subject, request.subject!), eq(authIdentities.enabled, true)));
    if (!identity) throw new Error(GOOGLE_ERRORS.failed);
    await tx.delete(googleAuthRequests).where(eq(googleAuthRequests.id, request.id));
    return work(tx, user);
  });
  (await cookies()).delete(GOOGLE_COOKIE);
  return result;
}

export async function googleAccountState(): Promise<GoogleAccountState> {
  const userId = await currentUserId();
  if (!userId) return { enabled: false, hasPassword: true, linked: false, email: null, confirmation: null };
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [identity] = await db.select().from(authIdentities).where(and(eq(authIdentities.userId, userId), eq(authIdentities.issuer, GOOGLE_ISSUER), eq(authIdentities.enabled, true)));
  let confirmation: GooglePurpose | null = null;
  try {
    confirmation = await db.transaction(async tx => {
      const request = await proved(tx);
      if (request.intent !== "confirm") return null;
      await target(tx, request);
      return request.purpose as GooglePurpose;
    });
  } catch { /* No usable proof; show the explicit confirmation button. */ }
  return { enabled: !!googleConfiguration(process.env), hasPassword: !!user?.passwordHash, linked: !!identity, email: identity?.email ?? null, confirmation };
}

/** Explicit logout also cancels a login still returning from Google. */
export async function cancelGoogleRequest(): Promise<void> {
  const jar = await cookies();
  const parts = jar.get(GOOGLE_COOKIE)?.value.split(".");
  if (parts?.length === 2 && parts.every(x => GOOGLE_TOKEN.test(x))) {
    await db.delete(googleAuthRequests).where(and(eq(googleAuthRequests.id, parts[0]), eq(googleAuthRequests.browserHash, digest(parts[1]))));
  }
  jar.delete(GOOGLE_COOKIE);
}
