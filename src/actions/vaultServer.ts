"use server";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, max, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  syncDeviceLinks,
  syncDevices,
  syncLoginMethods,
  syncSessions,
  syncSignInRequests,
  syncUsers,
  syncVaultVersions,
} from "@/db/schema";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/vault/password";
import { createGate } from "@/lib/vault/gate";
import { hashSessionToken, newSessionToken, sessionExpiry } from "@/lib/vault/session";
import {
  AnswerLinkRequest,
  AskLinkRequest,
  claimHashOf,
  CollectLinkRequest,
  CreateLinkRequest,
  CreateSignInRequest,
  GrantSignInRequest,
  isLinkId,
  LINK_SECONDS,
  linkState,
  MAX_WAITING_SIGN_INS,
  signInRequestState,
} from "@/lib/vault/link";
import { recoveryHashOf, sameKey } from "@/lib/vault/credentials";
import {
  isKeyed,
  KeyedLoginRequest,
  KeyedRegisterRequest,
  LoginRequest,
  NEEDS_WORDS,
  PutVaultRequest,
  DeleteAccountRequest,
  RecoverRequest,
  RegisterRequest,
  UpgradeCredentialsRequest,
  afterFailedLogin,
  checkVaultPut,
  lockedUntil,
  maxAccounts,
  oldestKeptVersion,
  registrationRefusal,
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

/**
 * How many password hashes may be computed at once, and how many may wait.
 *
 * Two at a time is 64 MB and two cores; eight more may queue, which at about
 * half a second each is a five-second wait in the worst case and nobody
 * arrives in that state legitimately. Everything past it is told the server is
 * busy — see `lib/vault/gate.ts` for why this exists at all. The numbers are
 * small on purpose: this is one person's app on one machine, and the real
 * ceiling is how many sign-ins a second a household needs, which is not two.
 */
const passwords = createGate({ running: 2, waiting: 8 });

const BUSY = "The server is busy checking other sign-ins. Try again in a moment.";

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

/** Accounts made so far, and in the last hour and day, for `registrationRefusal`. */
async function registrationCounts(executor: Pick<typeof db, "execute">) {
  const result = await executor.execute(sql`
    select count(*)::int as total,
           count(*) filter (where created_at > now() - interval '1 hour')::int as "lastHour",
           count(*) filter (where created_at > now() - interval '1 day')::int as "lastDay"
    from sync_users
  `);
  return result.rows[0] as { total: number; lastHour: number; lastDay: number };
}

/**
 * A registration of either kind, read as one: what to hash, and what to keep
 * beside it. The keyed kind is the site's (a password alone, the words sealed);
 * the older kind is what the phone app still sends.
 */
function readRegistration(raw: unknown) {
  if (isKeyed(raw)) {
    const parsed = KeyedRegisterRequest.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: parsed.error };
    const { email, signInKey, sealedWords, recoveryHash, deviceName } = parsed.data;
    return { ok: true as const, email, secret: signInKey, deviceName, sealedWords, recoveryHash };
  }
  const parsed = RegisterRequest.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error };
  const { email, password, deviceName } = parsed.data;
  return { ok: true as const, email, secret: password, deviceName, sealedWords: null, recoveryHash: null };
}

export async function registerSyncAccount(raw: unknown) {
  const parsed = readRegistration(raw);
  if (!parsed.ok) return invalid(parsed.error);
  const { email, secret, deviceName, sealedWords, recoveryHash } = parsed;

  /**
   * Limited before the password is hashed, so a closed server spends nothing on
   * a request it will refuse — and checked again inside the transaction under a
   * lock, so two registrations arriving together cannot both take the last place.
   */
  const limit = maxAccounts(process.env.SYNC_MAX_ACCOUNTS);
  const early = registrationRefusal(await registrationCounts(db), limit);
  if (early) return refusal(early.status, early.reason);

  // Hashed before the transaction: a slow step inside it would hold locks for
  // most of a second on every registration. Through the gate, because this
  // runs before anything has been checked — an address nobody owns costs a
  // full hash here, which is the cheapest attack on this server there is.
  const hashed = await passwords.run(() => hashPassword(secret, random));
  if (!hashed.ok) return refusal(429, BUSY);
  const secretHash = hashed.value;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sync_users.register'))`);
      const refused = registrationRefusal(await registrationCounts(tx), limit);
      if (refused) return refusal(refused.status, refused.reason);
      const [user] = await tx.insert(syncUsers).values({ email }).returning({ id: syncUsers.id });
      await tx
        .insert(syncLoginMethods)
        .values({ userId: user.id, kind: "password", subject: email, secretHash, sealedWords, recoveryHash });
      return { ok: true as const, ...(await openSession(tx, user.id, deviceName)) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return refusal(409, "An account with this address already exists. Sign in instead.");
    }
    throw error;
  }
}

/**
 * Signs in, or creates an account, for someone Google has just identified.
 *
 * Google settles who the person is and nothing else: the vault is still opened
 * by the twelve words, which never reach Google or this server. So this creates
 * the account and the device session, and the words are asked for — or shown to
 * be written down — in the page afterwards.
 *
 * An address that already has a password account is refused rather than taken
 * over. Both may well be the same person, but proving one login method does not
 * prove another, and linking them is something to do knowingly from inside the
 * account (task E03), not a side effect of pressing a button.
 */
export async function signInWithGoogle(identity: { subject: string; email: string }, deviceName: string) {
  const name = deviceName.trim().slice(0, 80) || "Browser";
  const [method] = await db
    .select()
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.kind, "google"), eq(syncLoginMethods.subject, identity.subject)));

  if (method) {
    return await db.transaction(async (tx) => ({
      ok: true as const,
      isNew: false,
      ...(await openSession(tx, method.userId, name)),
    }));
  }

  const limit = maxAccounts(process.env.SYNC_MAX_ACCOUNTS);
  const early = registrationRefusal(await registrationCounts(db), limit);
  if (early) return refusal(early.status, early.reason);

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sync_users.register'))`);
      const refused = registrationRefusal(await registrationCounts(tx), limit);
      if (refused) return refusal(refused.status, refused.reason);
      const [user] = await tx.insert(syncUsers).values({ email: identity.email }).returning({ id: syncUsers.id });
      await tx
        .insert(syncLoginMethods)
        .values({ userId: user.id, kind: "google", subject: identity.subject, secretHash: null });
      return { ok: true as const, isNew: true, ...(await openSession(tx, user.id, name)) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return refusal(
        409,
        "An account with this address already exists here. Sign in with its password; linking Google to it is not possible yet."
      );
    }
    throw error;
  }
}

/**
 * One more wrong password against a login method, and the lockout if it is the
 * last one allowed.
 *
 * Counted in SQL, not from the row just read. Parallel guesses would each read
 * the same count and each write it plus one, so a burst of attempts would
 * register as one — the lockout would stop a patient attacker and let a fast one
 * through. The increment is atomic; the policy deciding what that count means is
 * still `afterFailedLogin`.
 */
async function countFailedPassword(methodId: string, now: Date): Promise<void> {
  const [counted] = await db
    .update(syncLoginMethods)
    .set({ failedLogins: sql`${syncLoginMethods.failedLogins} + 1` })
    .where(eq(syncLoginMethods.id, methodId))
    .returning({ failedLogins: syncLoginMethods.failedLogins });
  const next = afterFailedLogin(counted.failedLogins - 1, now);
  if (next.lockedUntil !== null) {
    await db.update(syncLoginMethods).set(next).where(eq(syncLoginMethods.id, methodId));
  }
}

/**
 * A sign-in, with the sign-in key the site derives from a password, or with the
 * password itself as the phone app still sends it.
 *
 * With the key, the answer carries the account's sealed words, which only the
 * password that made the key can open. An older account has no key to check —
 * its hash is of the password — so a keyed sign-in there is told to open it
 * with its words once (`NEEDS_WORDS`), and `upgradeSyncCredentials` moves it.
 */
function readLogin(raw: unknown) {
  if (isKeyed(raw)) {
    const parsed = KeyedLoginRequest.safeParse(raw);
    if (!parsed.success) return { ok: false as const, error: parsed.error };
    return { ok: true as const, keyed: true, ...parsed.data, secret: parsed.data.signInKey };
  }
  const parsed = LoginRequest.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error };
  return { ok: true as const, keyed: false, ...parsed.data, secret: parsed.data.password };
}

export async function loginSyncAccount(raw: unknown) {
  const parsed = readLogin(raw);
  if (!parsed.ok) return invalid(parsed.error);
  const { email, secret: password, deviceName, keyed } = parsed;
  const now = new Date();

  const [method] = await db
    .select()
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.kind, "password"), eq(syncLoginMethods.subject, email)));

  if (!method || method.secretHash === null) {
    /**
     * The decoy keeps a wrong address and a wrong password the same length of
     * time, and it is also the one expensive thing on this server that needs
     * no account to trigger — the lockout below counts wrong passwords per
     * account, and an address that does not exist has none. It goes through
     * the same gate as a real check, so a flood of unknown addresses is
     * refused rather than served.
     */
    const decoy = await passwords.run(async () => verifyPassword(password, await decoyHash()));
    if (!decoy.ok) return refusal(429, BUSY);
    return refusal(401, WRONG_LOGIN);
  }

  const until = lockedUntil(method, now);
  if (until) {
    return refusal(429, `Too many wrong passwords. Try again after ${until.toISOString()}.`);
  }

  // Nothing to check a key against: the stored hash is of the password.
  if (keyed && method.sealedWords === null) return refusal(409, NEEDS_WORDS);

  // Held in a const: the check above proved it is there, and a closure would
  // not carry that proof.
  const stored = method.secretHash;
  const checked = await passwords.run(() => verifyPassword(password, stored));
  if (!checked.ok) return refusal(429, BUSY);
  if (!checked.value) {
    await countFailedPassword(method.id, now);
    return refusal(401, WRONG_LOGIN);
  }

  // A rehash is the same cost again, and it happens on a correct password —
  // the one case worth waiting for. When the gate is full the old hash is kept
  // and the next sign-in upgrades it; refusing a good password to reword a
  // stored hash would be the wrong thing to lose.
  const rehashed = needsRehash(method.secretHash) ? await passwords.run(() => hashPassword(password, random)) : null;
  const secretHash = rehashed?.ok ? rehashed.value : method.secretHash;
  return db.transaction(async (tx) => {
    await tx
      .update(syncLoginMethods)
      .set({ failedLogins: 0, lockedUntil: null, secretHash })
      .where(eq(syncLoginMethods.id, method.id));
    return {
      ok: true as const,
      ...(await openSession(tx, method.userId, deviceName)),
      sealedWords: method.sealedWords,
    };
  });
}

/**
 * An older account moving to a password alone, from a page that has just
 * opened it with its twelve words.
 *
 * The password is asked for once more, not taken from the session: a session
 * lifted from a device must not be enough to replace how the account signs in.
 * After this the stored hash is of the sign-in key, the password stops coming
 * here at all, and the words stay sealed beside it.
 */
export async function upgradeSyncCredentials(token: string | null, raw: unknown) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const parsed = UpgradeCredentialsRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { password, signInKey, sealedWords, recoveryHash } = parsed.data;
  const now = new Date();

  const [method] = await db
    .select()
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.userId, session.userId), eq(syncLoginMethods.kind, "password")));
  if (!method || method.secretHash === null) return refusal(403, "This account has no password to move.");
  if (method.sealedWords !== null) return refusal(409, "This account already signs in with its password alone.");
  const until = lockedUntil(method, now);
  if (until) return refusal(429, `Too many wrong passwords. Try again after ${until.toISOString()}.`);

  const stored = method.secretHash;
  const checked = await passwords.run(() => verifyPassword(password, stored));
  if (!checked.ok) return refusal(429, BUSY);
  if (!checked.value) {
    await countFailedPassword(method.id, now);
    return refusal(403, "That is not this account's password. Nothing was changed.");
  }
  const hashed = await passwords.run(() => hashPassword(signInKey, random));
  if (!hashed.ok) return refusal(429, BUSY);

  // Only if it is still the older kind: two pages moving it at once, one wins.
  const [moved] = await db
    .update(syncLoginMethods)
    .set({ secretHash: hashed.value, sealedWords, recoveryHash, failedLogins: 0, lockedUntil: null })
    .where(and(eq(syncLoginMethods.id, method.id), isNull(syncLoginMethods.sealedWords)))
    .returning({ id: syncLoginMethods.id });
  if (!moved) return refusal(409, "This account already signs in with its password alone.");
  return { ok: true as const };
}

/** Same words for an unknown address, an account with no recovery, and the wrong twelve words. */
const WRONG_WORDS = "Those twelve words and that address do not match an account.";

/**
 * A forgotten password replaced, with the twelve words as the proof.
 *
 * The page sends the recovery key the words give, never the words: the server
 * checks it against the hash it kept and learns nothing that opens the vault.
 * Wrong words count as a wrong password, so this is no faster way to guess.
 */
export async function recoverSyncAccount(raw: unknown) {
  const parsed = RecoverRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { email, recoveryKey, signInKey, sealedWords, deviceName } = parsed.data;
  const now = new Date();

  const [method] = await db
    .select()
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.kind, "password"), eq(syncLoginMethods.subject, email)));
  if (!method || method.recoveryHash === null) return refusal(401, WRONG_WORDS);
  const until = lockedUntil(method, now);
  if (until) return refusal(429, `Too many wrong attempts. Try again after ${until.toISOString()}.`);
  if (!sameKey(recoveryHashOf(recoveryKey), method.recoveryHash)) {
    await countFailedPassword(method.id, now);
    return refusal(401, WRONG_WORDS);
  }

  const hashed = await passwords.run(() => hashPassword(signInKey, random));
  if (!hashed.ok) return refusal(429, BUSY);
  return db.transaction(async (tx) => {
    await tx
      .update(syncLoginMethods)
      .set({ secretHash: hashed.value, sealedWords, failedLogins: 0, lockedUntil: null })
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
    if (result.rowCount === 1) {
      /**
       * Versions older than the last `KEPT_VAULT_VERSIONS` go once a newer one is
       * stored. Best effort: the write above has succeeded, and failing it now
       * would send the device into a retry that the version check then refuses.
       * The next write tries again.
       */
      try {
        await db
          .delete(syncVaultVersions)
          .where(and(eq(syncVaultVersions.userId, session.userId), lt(syncVaultVersions.version, oldestKeptVersion(body.vaultVersion))));
      } catch {
        // Kept for now; nothing is lost by keeping an old version a little longer.
      }
      return { ok: true as const, vaultVersion: body.vaultVersion };
    }
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

/**
 * Deletes the account and everything this server holds for it: the login, every
 * device and session, and every stored version of the vault.
 *
 * It asks for the password again, not only the session. A session is what a lost
 * or borrowed phone still carries, and this cannot be undone; the password check
 * goes through the same gate and lockout as a sign-in, so it is no cheaper way to
 * guess one.
 *
 * What it does not reach, and the app says so before the button: the copies on
 * each device, which stay until they are erased there, and the database
 * provider's own backups, which keep the ciphertext until they expire.
 */
export async function deleteSyncAccount(token: string | null, raw: unknown) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const parsed = DeleteAccountRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const now = new Date();

  const [method] = await db
    .select()
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.userId, session.userId), eq(syncLoginMethods.kind, "password")));
  if (!method || method.secretHash === null) return refusal(403, "This account has no password to confirm with.");
  const until = lockedUntil(method, now);
  if (until) return refusal(429, `Too many wrong passwords. Try again after ${until.toISOString()}.`);

  // An account that signs in with a password alone stores the sign-in key's
  // hash, so that is what confirms it; an older one, the password's.
  const secret = "password" in parsed.data ? parsed.data.password : parsed.data.signInKey;
  const stored = method.secretHash;
  const checked = await passwords.run(() => verifyPassword(secret, stored));
  if (!checked.ok) return refusal(429, BUSY);
  if (!checked.value) {
    await countFailedPassword(method.id, now);
    return refusal(403, "That is not this account's password. Nothing was deleted.");
  }

  // Everything else goes with the account: every table here cascades from it.
  await db.delete(syncUsers).where(eq(syncUsers.id, session.userId));
  return { ok: true as const };
}

// ---------- Opening the vault on a phone from a code on this device ----------
//
// The steps and why each exists are in lib/vault/link.ts. What is here is the
// part only a database can do: one code per account, a few minutes long, moved
// from one state to the next only if it is still in the one before — each move
// is a single conditional write, so two phones scanning at once cannot both be
// the one that asked.

const LINK_GONE = "This code was already used, or it expired. Show a new one on the other device.";

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A new code for this account, replacing any it had. Holds the words sealed, never the key. */
export async function createDeviceLink(token: string | null, raw: unknown) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  const parsed = CreateLinkRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);

  const now = new Date();
  const id = randomBytes(16).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_SECONDS * 1000);
  await db.transaction(async (tx) => {
    // One code at a time per account, and none kept anywhere past its minutes.
    await tx
      .delete(syncDeviceLinks)
      .where(or(eq(syncDeviceLinks.userId, session.userId), lt(syncDeviceLinks.expiresAt, now)));
    await tx.insert(syncDeviceLinks).values({ id, userId: session.userId, ciphertext: parsed.data.sealed, expiresAt });
  });
  return { ok: true as const, id, expiresAt };
}

/** Where this account's code stands, for the device showing it. */
export async function deviceLinkStatus(token: string | null, id: string) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  if (!isLinkId(id)) return refusal(404, LINK_GONE);
  const [row] = await db
    .select({ state: syncDeviceLinks.state, expiresAt: syncDeviceLinks.expiresAt, deviceName: syncDeviceLinks.deviceName })
    .from(syncDeviceLinks)
    .where(and(eq(syncDeviceLinks.id, id), eq(syncDeviceLinks.userId, session.userId)));
  if (!row) return refusal(404, LINK_GONE);
  return { ok: true as const, state: linkState(row, new Date()), deviceName: row.deviceName };
}

/** The owner's yes or no to the phone that asked. A no ends the code. */
export async function answerDeviceLink(token: string | null, id: string, raw: unknown) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  if (!isLinkId(id)) return refusal(404, LINK_GONE);
  const parsed = AnswerLinkRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);

  const mine = and(eq(syncDeviceLinks.id, id), eq(syncDeviceLinks.userId, session.userId));
  if (!parsed.data.allow) {
    await db.delete(syncDeviceLinks).where(and(mine, ne(syncDeviceLinks.state, "collected")));
    return { ok: true as const, state: "refused" as const };
  }
  const approved = await db
    .update(syncDeviceLinks)
    .set({ state: "approved" })
    .where(and(mine, eq(syncDeviceLinks.state, "asked"), gt(syncDeviceLinks.expiresAt, new Date())))
    .returning({ id: syncDeviceLinks.id });
  if (approved.length === 0) return refusal(409, "That phone is no longer waiting. Show a new code.");
  return { ok: true as const, state: "approved" as const };
}

/** A phone that scanned the code, asking to be let in. No session: the code is its only credential. */
export async function askDeviceLink(id: string, raw: unknown) {
  if (!isLinkId(id)) return refusal(404, LINK_GONE);
  const parsed = AskLinkRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const asked = await db
    .update(syncDeviceLinks)
    .set({ state: "asked", deviceName: parsed.data.deviceName, claimHash: parsed.data.claimHash })
    .where(
      and(eq(syncDeviceLinks.id, id), eq(syncDeviceLinks.state, "waiting"), gt(syncDeviceLinks.expiresAt, new Date()))
    )
    .returning({ id: syncDeviceLinks.id });
  if (asked.length === 0) return refusal(404, LINK_GONE);
  return { ok: true as const };
}

/**
 * The phone that asked, once the owner said yes: a session of its own and the
 * sealed words, handed over once. The row keeps only that it was used.
 */
export async function collectDeviceLink(id: string, raw: unknown) {
  if (!isLinkId(id)) return refusal(404, LINK_GONE);
  const parsed = CollectLinkRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const claimHash = claimHashOf(parsed.data.claimKey);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(syncDeviceLinks).where(eq(syncDeviceLinks.id, id)).for("update");
    // The same answer whether the code is unknown or the claim is not this phone's.
    if (!row || row.claimHash === null || !sameHash(row.claimHash, claimHash)) return refusal(404, LINK_GONE);
    const state = linkState(row, now);
    if (state === "asked") return { ok: true as const, waiting: true as const };
    if (state !== "approved" || row.ciphertext === null) return refusal(404, LINK_GONE);

    const opened = await openSession(tx, row.userId, row.deviceName ?? "Phone");
    const [owner] = await tx.select({ email: syncUsers.email }).from(syncUsers).where(eq(syncUsers.id, row.userId));
    await tx
      .update(syncDeviceLinks)
      .set({ state: "collected", ciphertext: null, claimHash: null })
      .where(eq(syncDeviceLinks.id, id));
    return { ok: true as const, waiting: false as const, ...opened, sealed: row.ciphertext, email: owner?.email ?? null };
  });
}

// ---------- Letting a device in from a phone already in the vault ----------
//
// The reverse of the above: the device with no session shows the code, and a
// phone that is signed in scans it and says yes. See syncSignInRequests in
// the schema for what each column holds and when.

const REQUEST_GONE = "This code was already used, refused, or it expired. Show a new one on the computer.";

/** A device with no session, asking to be let in. It needs no account; the phone that answers does. */
export async function createSignInRequest(raw: unknown) {
  const parsed = CreateSignInRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const now = new Date();
  const id = randomBytes(16).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_SECONDS * 1000);
  return db.transaction(async (tx) => {
    await tx.delete(syncSignInRequests).where(lt(syncSignInRequests.expiresAt, now));
    const [{ waiting }] = await tx.select({ waiting: count() }).from(syncSignInRequests);
    if (waiting >= MAX_WAITING_SIGN_INS) {
      return refusal(429, "Too many devices are waiting to be let in. Try again in a few minutes.");
    }
    await tx.insert(syncSignInRequests).values({
      id,
      deviceName: parsed.data.deviceName,
      claimHash: parsed.data.claimHash,
      expiresAt,
    });
    return { ok: true as const, id, expiresAt };
  });
}

/** Which device is asking, for the phone to show before anyone says yes. */
export async function signInRequestFor(token: string | null, id: string) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  if (!isLinkId(id)) return refusal(404, REQUEST_GONE);
  const [row] = await db
    .select({ deviceName: syncSignInRequests.deviceName, state: syncSignInRequests.state, expiresAt: syncSignInRequests.expiresAt })
    .from(syncSignInRequests)
    .where(eq(syncSignInRequests.id, id));
  if (!row || signInRequestState(row, new Date()) !== "waiting") return refusal(404, REQUEST_GONE);
  return { ok: true as const, deviceName: row.deviceName };
}

/** The phone's yes: this account, and its twelve words sealed with the code's key. */
export async function grantSignInRequest(token: string | null, id: string, raw: unknown) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  if (!isLinkId(id)) return refusal(404, REQUEST_GONE);
  const parsed = GrantSignInRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const granted = await db
    .update(syncSignInRequests)
    .set({ state: "granted", userId: session.userId, ciphertext: parsed.data.sealed })
    .where(
      and(
        eq(syncSignInRequests.id, id),
        eq(syncSignInRequests.state, "waiting"),
        gt(syncSignInRequests.expiresAt, new Date())
      )
    )
    .returning({ id: syncSignInRequests.id });
  if (granted.length === 0) return refusal(404, REQUEST_GONE);
  return { ok: true as const };
}

/** The phone's no. The waiting device is told the code no longer works. */
export async function refuseSignInRequest(token: string | null, id: string) {
  const session = await authenticate(token);
  if (!session) return refusal(401, "Sign in again: this device's session is not valid.");
  if (!isLinkId(id)) return refusal(404, REQUEST_GONE);
  await db
    .delete(syncSignInRequests)
    .where(and(eq(syncSignInRequests.id, id), eq(syncSignInRequests.state, "waiting")));
  return { ok: true as const };
}

/**
 * The waiting device, collecting once a phone said yes: a session of its own,
 * the sealed words, and whose vault it is — so it can say so, rather than
 * leave someone recording money into an account they did not mean to open.
 */
export async function collectSignInRequest(id: string, raw: unknown) {
  if (!isLinkId(id)) return refusal(404, REQUEST_GONE);
  const parsed = CollectLinkRequest.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const claimHash = claimHashOf(parsed.data.claimKey);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(syncSignInRequests).where(eq(syncSignInRequests.id, id)).for("update");
    if (!row || !sameHash(row.claimHash, claimHash)) return refusal(404, REQUEST_GONE);
    const state = signInRequestState(row, now);
    if (state === "waiting") return { ok: true as const, waiting: true as const };
    if (state !== "granted" || row.userId === null || row.ciphertext === null) return refusal(404, REQUEST_GONE);

    const opened = await openSession(tx, row.userId, row.deviceName);
    const [owner] = await tx.select({ email: syncUsers.email }).from(syncUsers).where(eq(syncUsers.id, row.userId));
    await tx
      .update(syncSignInRequests)
      .set({ state: "collected", ciphertext: null })
      .where(eq(syncSignInRequests.id, id));
    return { ok: true as const, waiting: false as const, ...opened, sealed: row.ciphertext, email: owner?.email ?? null };
  });
}
