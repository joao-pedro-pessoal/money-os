"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { syncDevices, syncLoginMethods, syncSessions, syncUsers, syncVaultVersions } from "@/db/schema";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/vault/password";
import { hashSessionToken, newSessionToken, sessionExpiry } from "@/lib/vault/session";
import {
  LoginRequest,
  PutVaultRequest,
  RegisterRequest,
  afterFailedLogin,
  checkVaultPut,
  lockedUntil,
} from "@/lib/vault/protocol";

/**
 * The encrypted-sync server's database access.
 *
 * Every function here validates its own input and authenticates its own token,
 * rather than trusting the route that called it. A `"use server"` module's
 * exports can become server actions, callable from a browser without passing
 * through a route at all, so a check that lived only in the route would be a check
 * that could be skipped.
 *
 * None of this reads or writes the single-user tables. An account here can store
 * and fetch its own ciphertext, list and revoke its own devices, and nothing else.
 */

const random = (n: number) => new Uint8Array(randomBytes(n));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Refusal = { ok: false; status: 400 | 401 | 403 | 404 | 409 | 429; reason: string };

function refusal(status: Refusal["status"], reason: string): Refusal {
  return { ok: false, status, reason };
}

function invalid(error: { issues: { message: string }[] }): Refusal {
  return refusal(400, error.issues[0]?.message ?? "Invalid request.");
}

/** Same words whether the address is unknown or the password wrong. */
const WRONG_LOGIN = "That address and password do not match an account.";

/** Postgres's unique_violation, found through however many wrappers the driver adds. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * A hash to check a password against when the address has no account.
 *
 * Without it an unknown address answers in a millisecond and a known one after a
 * slow scrypt, and the difference tells anyone which addresses have accounts.
 */
let decoy: Promise<string> | null = null;
function decoyHash(): Promise<string> {
  decoy ??= hashPassword("not a real password, only a timing decoy", random);
  return decoy;
}

async function openSession(tx: Tx, userId: string, deviceName: string) {
  const { token, tokenHash } = await newSessionToken(random);
  const [device] = await tx
    .insert(syncDevices)
    .values({ userId, name: deviceName })
    .returning({ id: syncDevices.id });
  await tx.insert(syncSessions).values({
    userId, deviceId: device.id, tokenHash, expiresAt: sessionExpiry(new Date()),
  });
  return { token, userId, deviceId: device.id };
}

async function authenticate(token: string | null): Promise<{ userId: string; deviceId: string } | null> {
  if (token === null) return null;
  let tokenHash: string;
  try {
    tokenHash = hashSessionToken(token);
  } catch {
    return null;
  }
  const now = new Date();
  const [session] = await db
    .select({ userId: syncSessions.userId, deviceId: syncSessions.deviceId })
    .from(syncSessions)
    .innerJoin(syncDevices, eq(syncDevices.id, syncSessions.deviceId))
    .where(
      and(
        eq(syncSessions.tokenHash, tokenHash),
        isNull(syncSessions.revokedAt),
        gt(syncSessions.expiresAt, now),
        isNull(syncDevices.revokedAt)
      )
    );
  if (!session) return null;
  await db.update(syncDevices).set({ lastSeenAt: now }).where(eq(syncDevices.id, session.deviceId));
  return session;
}

export async function registerSyncAccount(raw: unknown) {
  const parsed = RegisterRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { email, password, deviceName } = parsed.data;

  // Hashed before the transaction: a slow step inside it would hold locks for
  // most of a second on every registration.
  const secretHash = await hashPassword(password, random);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(syncUsers).values({ email }).returning({ id: syncUsers.id });
      await tx.insert(syncLoginMethods).values({ userId: user.id, kind: "password", subject: email, secretHash });
      return { ok: true as const, ...(await openSession(tx, user.id, deviceName)) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return refusal(409, "An account with this address already exists. Sign in instead.");
    }
    throw error;
  }
}

export async function loginSyncAccount(raw: unknown) {
  const parsed = LoginRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { email, password, deviceName } = parsed.data;
  const now = new Date();

  const [method] = await db
    .select()
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.kind, "password"), eq(syncLoginMethods.subject, email)));

  if (!method || method.secretHash === null) {
    await verifyPassword(password, await decoyHash());
    return refusal(401, WRONG_LOGIN);
  }

  const until = lockedUntil(method, now);
  if (until) {
    return refusal(429, `Too many wrong passwords. Try again after ${until.toISOString()}.`);
  }

  if (!(await verifyPassword(password, method.secretHash))) {
    /**
     * Counted in SQL, not from the row just read.
     *
     * Parallel guesses would each read the same count and each write it plus one,
     * so a burst of attempts would register as one — the lockout would stop a
     * patient attacker and let a fast one through. The increment is atomic; the
     * policy deciding what that count means is still `afterFailedLogin`.
     */
    const [counted] = await db
      .update(syncLoginMethods)
      .set({ failedLogins: sql`${syncLoginMethods.failedLogins} + 1` })
      .where(eq(syncLoginMethods.id, method.id))
      .returning({ failedLogins: syncLoginMethods.failedLogins });
    const next = afterFailedLogin(counted.failedLogins - 1, now);
    if (next.lockedUntil !== null) {
      await db.update(syncLoginMethods).set(next).where(eq(syncLoginMethods.id, method.id));
    }
    return refusal(401, WRONG_LOGIN);
  }

  const secretHash = needsRehash(method.secretHash) ? await hashPassword(password, random) : method.secretHash;
  return db.transaction(async (tx) => {
    await tx
      .update(syncLoginMethods)
      .set({ failedLogins: 0, lockedUntil: null, secretHash })
      .where(eq(syncLoginMethods.id, method.id));
    return { ok: true as const, ...(await openSession(tx, method.userId, deviceName)) };
  });
}

export async function latestSyncVault(token: string | null) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const [row] = await db
    .select({ vaultVersion: syncVaultVersions.version, text: syncVaultVersions.envelope })
    .from(syncVaultVersions)
    .where(eq(syncVaultVersions.userId, session.userId))
    .orderBy(desc(syncVaultVersions.version))
    .limit(1);
  return { ok: true as const, vault: row ?? null };
}

export async function putSyncVault(token: string | null, raw: unknown) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const parsed = PutVaultRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const body = parsed.data;

  const [{ current }] = await db
    .select({ current: max(syncVaultVersions.version) })
    .from(syncVaultVersions)
    .where(eq(syncVaultVersions.userId, session.userId));
  const decision = checkVaultPut({ sessionUserId: session.userId, currentVersion: current ?? 0, body });
  if (!decision.ok) return decision;

  /**
   * The write that makes a stale send fail instead of overwriting.
   *
   * The check above read the newest version and another device may have written
   * since. This insert repeats the condition in the same statement, and the
   * primary key on (account, version) settles the case where two devices pass it
   * at once: one row lands, the other gets a unique violation and a 409.
   */
  try {
    const result = await db.execute(sql`
      insert into sync_vault_versions (user_id, version, device_id, envelope)
      select ${session.userId}, ${body.vaultVersion}, ${session.deviceId}, ${body.text}
      where coalesce(
        (select max(version) from sync_vault_versions where user_id = ${session.userId}), 0
      ) = ${body.expectedVersion}
    `);
    if (result.rowCount === 1) return { ok: true as const, vaultVersion: body.vaultVersion };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return refusal(409, "Another device stored a newer version first. Read it, merge, and send again.");
}

export async function listSyncDevices(token: string | null) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const rows = await db
    .select({
      id: syncDevices.id,
      name: syncDevices.name,
      createdAt: syncDevices.createdAt,
      lastSeenAt: syncDevices.lastSeenAt,
      revokedAt: syncDevices.revokedAt,
    })
    .from(syncDevices)
    .where(eq(syncDevices.userId, session.userId))
    .orderBy(desc(syncDevices.createdAt));
  return { ok: true as const, devices: rows.map((d) => ({ ...d, current: d.id === session.deviceId })) };
}

/**
 * Signs a device out of the account, for good.
 *
 * Stops the server serving it; does not erase what it already holds, and does not
 * rotate the seed. Both are recorded in docs/PLANO_MOBILE.md as the device's and
 * the owner's part of revoking a lost phone.
 */
export async function revokeSyncDevice(token: string | null, deviceId: string) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const now = new Date();
  return db.transaction(async (tx) => {
    const revoked = await tx
      .update(syncDevices)
      .set({ revokedAt: now })
      .where(and(eq(syncDevices.id, deviceId), eq(syncDevices.userId, session.userId), isNull(syncDevices.revokedAt)))
      .returning({ id: syncDevices.id });
    if (revoked.length === 0) return refusal(404, "No active device with that id on this account.");
    await tx
      .update(syncSessions)
      .set({ revokedAt: now })
      .where(and(eq(syncSessions.deviceId, deviceId), isNull(syncSessions.revokedAt)));
    return { ok: true as const };
  });
}
