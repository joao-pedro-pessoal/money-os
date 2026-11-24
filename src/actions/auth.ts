"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { asUser, db } from "@/db/client";
import { authIdentities, OWNER_USER_ID, users } from "@/db/schema";
import { newSessionValue, ownerPassword, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  KEY_HEX,
  newRecoveryCode,
  normalizeEmail,
  recoveryHashOf,
  sameKey,
  signInKeyFor,
} from "@/lib/accounts/credentials";
import { accountHashes as hashes, countFailure } from "./passwordWork";
import { lockedUntil, maxAccounts, registrationRefusal } from "@/lib/accounts/limits";
import { hashPassword, needsRehash, PASSWORD_MAX, verifyPassword } from "@/lib/accounts/password";
import type { DeleteOutcome, RecoveryOutcome, SignInOutcome, SignUpOutcome } from "@/lib/accounts/outcomes";
import { currentUserId } from "./session";
import { ensureStartingData, ensureRates, seedNewAccount, registrationCounts, insertRegisteredUser, RegistrationRefused } from "./accountProvisioning";
import { withGoogleConfirmation } from "./googleFlow";
import { registrationAccess } from "@/lib/accounts/registration";
import { TOO_MANY_ATTEMPTS } from "@/lib/accounts/attempts";
import { admitted } from "./attemptGate";
import { registrationBotRefusal } from "./registrationBot";

/**
 * Sign-in accounts: making one, signing into one, and getting back into one.
 *
 * Every export here is an endpoint anyone can call, so each validates its own
 * input and none hands out a session without the password (or the recovery
 * code) first. The page never sends the password itself — it sends the sign-in
 * key it derived from it (lib/accounts/credentials.ts) — except once, for an
 * account whose stored hash is of the password (`legacy`, from the vault era),
 * which is then moved to a key and never asked for that way again.
 *
 * Wrong passwords count against the account and lock it for a while at ten
 * (lib/accounts/limits.ts). An unknown address answers like a wrong password,
 * after the same slow check against a decoy, so the page never says which
 * addresses have accounts — except, unavoidably, when someone tries to make
 * one with an address that already has one.
 */

const random = (n: number) => new Uint8Array(randomBytes(n));

/** The slow hashes: two at once, eight waiting, the rest told to try again (lib/accounts/gate.ts). */
const BUSY = "The server is busy with other sign-ins. Try again in a moment.";

let decoy: Promise<string> | null = null;
function decoyHash(): Promise<string> {
  decoy ??= hashPassword("not a real password, only a timing decoy", random);
  return decoy;
}

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const signInKey = z.string().regex(KEY_HEX);

const SignInRequest = z
  .object({ email, signInKey, password: z.string().min(1).max(PASSWORD_MAX).optional() })
  .strict();
// `website` is a field people never see and never fill in (LoginScreen); a form robot does.
const SignUpRequest = z
  .object({ email, signInKey, inviteCode: z.string().max(256).optional(), website: z.string().max(200).optional() })
  .strict();
const RecoverRequest = z.object({ email, recoveryCode: z.string().max(64), signInKey }).strict();
const NewCodeRequest = z.object({ signInKey: signInKey.optional() }).strict();
const DeleteRequest = z.object({ signInKey: signInKey.optional(), confirmEmail: z.string().max(254) }).strict();

async function startSession(userId: string, issuedAt: Date = new Date()): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(userId, issuedAt), sessionCookieOptions());
}

/** A slow verification cannot authorize a write after the credentials were replaced. */
function unchangedCredential(user: Pick<typeof users.$inferSelect, "id" | "sessionsNotBefore">, passwordHash: string) {
  return and(eq(users.id, user.id), eq(users.passwordHash, passwordHash),
    user.sessionsNotBefore ? eq(users.sessionsNotBefore, user.sessionsNotBefore) : isNull(users.sessionsNotBefore));
}

function lockedAnswer(until: Date): { kind: "locked"; until: string } {
  return { kind: "locked", until: until.toISOString() };
}

/**
 * The key the owner's page would send for this email: derived here from
 * APP_PASSWORD the way the page derives it from what was typed. Only for the
 * owner's first sign-in; kept per email for the life of the process.
 */
const ownerKeys = new Map<string, Promise<string>>();
function ownerKeyFor(address: string): Promise<string> {
  let key = ownerKeys.get(address);
  if (!key) {
    if (ownerKeys.size >= 16) ownerKeys.clear();
    key = signInKeyFor(address, ownerPassword());
    ownerKeys.set(address, key);
    key.catch(() => ownerKeys.delete(address));
  }
  return key;
}

/** The owner's email from the environment, when set. */
function ownerEmail(): string | null {
  const value = normalizeEmail(process.env.APP_EMAIL ?? "");
  return value === "" ? null : value;
}

/**
 * The owner's first sign-in: the account everything from the one-person era
 * belongs to has no email or password yet, and gets them here — the email
 * typed (APP_EMAIL when that is set) and a hash of the key for APP_PASSWORD.
 */
async function claimOwner(address: string, key: string, now: Date): Promise<SignInOutcome> {
  const [owner] = await db.select().from(users).where(eq(users.id, OWNER_USER_ID));
  if (!owner) return { kind: "wrong" };
  const until = lockedUntil(owner, now);
  if (until) return lockedAnswer(until);
  if (!sameKey(key, await ownerKeyFor(address))) {
    const locked = await countFailure(owner.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }
  const hashed = await hashes.run(() => hashPassword(key, random));
  if (!hashed.ok) return { kind: "refused", reason: BUSY };
  const recoveryCode = newRecoveryCode(random);
  try {
    await db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: users.id }).from(users).where(and(eq(users.email, address), sql`${users.id} <> ${OWNER_USER_ID}`));
      if (taken) throw new RegistrationRefused("This address belongs to another account.");
      const [claimed] = await tx.update(users).set({ email: address, passwordHash: hashed.value,
        passwordKind: "keyed", recoveryHash: recoveryHashOf(recoveryCode), failedLogins: 0, lockedUntil: null })
        .where(and(eq(users.id, OWNER_USER_ID), isNull(users.passwordHash))).returning({ id: users.id });
      if (!claimed) throw new RegistrationRefused("Already claimed.");
    });
  } catch (error) {
    if (error instanceof RegistrationRefused || isUniqueViolation(error)) return { kind: "wrong" };
    throw error;
  }
  await startSession(OWNER_USER_ID);
  return { kind: "new-code", recoveryCode };
}

export async function signIn(raw: unknown): Promise<SignInOutcome> {
  const parsed = SignInRequest.safeParse(raw);
  if (!parsed.success) return { kind: "wrong" };
  const { email: address, signInKey: key, password } = parsed.data;
  const now = new Date();
  if (!(await admitted("sign-in"))) return { kind: "refused", reason: TOO_MANY_ATTEMPTS };

  const [owner] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, OWNER_USER_ID));
  const [user] = await db.select().from(users).where(eq(users.email, address));
  const expected = ownerEmail();
  if (owner && owner.passwordHash === null && (expected === null ? !user : address === expected)) {
    return claimOwner(address, key, now);
  }

  if (!user || user.passwordHash === null) {
    const checked = await hashes.run(async () => verifyPassword(key, await decoyHash()));
    return checked.ok ? { kind: "wrong" } : { kind: "refused", reason: BUSY };
  }
  const until = lockedUntil(user, now);
  if (until) return lockedAnswer(until);

  // An account whose hash is of the password itself needs it once, to move.
  const legacy = user.passwordKind === "legacy";
  if (legacy && password === undefined) return { kind: "legacy" };
  const secret = legacy ? password! : key;

  const stored = user.passwordHash;
  const checked = await hashes.run(() => verifyPassword(secret, stored));
  if (!checked.ok) return { kind: "refused", reason: BUSY };
  if (!checked.value) {
    const locked = await countFailure(user.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }

  const rehash = legacy || needsRehash(stored);
  const renewed = rehash ? await hashes.run(() => hashPassword(key, random)) : null;
  // An account that came without a recovery code (from the vault) gets one now, shown once.
  const recoveryCode = user.recoveryHash === null ? newRecoveryCode(random) : null;
  const [signedIn] = await db
    .update(users)
    .set({
      failedLogins: 0,
      lockedUntil: null,
      ...(renewed?.ok ? { passwordHash: renewed.value, passwordKind: "keyed" } : {}),
      ...(recoveryCode ? { recoveryHash: recoveryHashOf(recoveryCode) } : {}),
    })
    .where(unchangedCredential(user, stored))
    .returning({ id: users.id });
  if (!signedIn) return { kind: "wrong" };
  await asUser(user.id, ensureStartingData);
  // A revocation during starting-data work must also end this pending sign-in.
  await startSession(user.id, now);
  return recoveryCode ? { kind: "new-code", recoveryCode } : { kind: "ok" };
}

/** Postgres's unique_violation, through however many wrappers the driver adds. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function signUp(raw: unknown): Promise<SignUpOutcome> {
  const parsed = SignUpRequest.safeParse(raw);
  if (!parsed.success) return { kind: "refused", reason: "Write a valid email address." };
  const { email: address, signInKey: key } = parsed.data;

  // A robot filled in the field no person sees: answered like a busy server, not told why.
  if (parsed.data.website) return { kind: "refused", reason: BUSY };

  const access = registrationAccess(process.env, parsed.data.inviteCode);
  if (access) return { kind: "refused", reason: access };
  if (!(await admitted("sign-up"))) return { kind: "refused", reason: TOO_MANY_ATTEMPTS };
  const botRefusal = await registrationBotRefusal();
  if (botRefusal) return { kind: "refused", reason: botRefusal };

  // Checked before the slow hash: a closed site spends nothing on a refusal.
  const refused = registrationRefusal(await registrationCounts(), maxAccounts(process.env));
  if (refused) return { kind: "refused", reason: refused };

  // The owner's address stays the owner's until their first sign-in claims it.
  const [owner] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, OWNER_USER_ID));
  const taken = "An account with this email already exists. Sign in instead.";
  if (owner && owner.passwordHash === null && address === ownerEmail()) return { kind: "refused", reason: taken };

  const hashed = await hashes.run(() => hashPassword(key, random));
  if (!hashed.ok) return { kind: "refused", reason: BUSY };
  const recoveryCode = newRecoveryCode(random);
  let userId: string;
  try {
    const result = await db.transaction(async (tx) => {
      const id = await insertRegisteredUser(tx, { email: address, passwordHash: hashed.value, passwordKind: "keyed", recoveryHash: recoveryHashOf(recoveryCode) });
      return { kind: "created" as const, id };
    });
    userId = result.id;
  } catch (error) {
    if (error instanceof RegistrationRefused) return { kind: "refused", reason: error.message };
    if (isUniqueViolation(error)) return { kind: "refused", reason: taken };
    throw error;
  }
  await asUser(userId, async () => {
    await seedNewAccount();
    await ensureRates();
  });
  await startSession(userId);
  return { kind: "ok", recoveryCode };
}

/**
 * A forgotten password replaced with the recovery code. The code is used up:
 * a new one is made and shown, and every other session of the account ends —
 * whoever had the old password is signed out with it.
 */
export async function recoverAccount(raw: unknown): Promise<RecoveryOutcome> {
  const parsed = RecoverRequest.safeParse(raw);
  if (!parsed.success) return { kind: "wrong" };
  const { email: address, recoveryCode, signInKey: key } = parsed.data;
  const now = new Date();
  if (!(await admitted("recover"))) return { kind: "refused", reason: TOO_MANY_ATTEMPTS };

  let presented: string;
  try {
    presented = recoveryHashOf(recoveryCode);
  } catch {
    return { kind: "wrong" };
  }
  const [user] = await db.select().from(users).where(eq(users.email, address));
  if (!user || user.recoveryHash === null) return { kind: "wrong" };
  const until = lockedUntil(user, now);
  if (until) return lockedAnswer(until);
  if (!sameKey(presented, user.recoveryHash)) {
    const locked = await countFailure(user.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }

  const hashed = await hashes.run(() => hashPassword(key, random));
  if (!hashed.ok) return { kind: "refused", reason: BUSY };
  const next = newRecoveryCode(random);
  // Include sign-ins begun while the hash was running, including this millisecond.
  const cutoff = new Date(Date.now() + 1);
  const recovered = await db.transaction(async tx => {
    const [recovered] = await tx
    .update(users)
    .set({
      passwordHash: hashed.value,
      passwordKind: "keyed",
      recoveryHash: recoveryHashOf(next),
      failedLogins: 0,
      lockedUntil: null,
      sessionsNotBefore: cutoff,
      authVersion: sql`${users.authVersion} + 1`,
    })
    // The slow hash allows another request to consume or replace the code.
    // Check it again atomically with the write, not in a second SELECT.
    .where(and(eq(users.id, user.id), eq(users.recoveryHash, presented)))
    .returning({ id: users.id });
    if (recovered) await tx.update(authIdentities).set({ enabled: false }).where(eq(authIdentities.userId, user.id));
    return recovered;
  });
  if (!recovered) return { kind: "wrong" };
  await startSession(user.id, cutoff);
  return { kind: "ok", recoveryCode: next };
}

/**
 * A new recovery code for the signed-in account, after its password: a stolen
 * session alone must not be enough to take the way back in.
 */
export async function replaceRecoveryCode(raw: unknown): Promise<RecoveryOutcome> {
  const parsed = NewCodeRequest.safeParse(raw);
  if (!parsed.success) return { kind: "wrong" };
  const userId = await currentUserId();
  if (!userId) return { kind: "refused", reason: "Sign in again." };
  const now = new Date();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { kind: "refused", reason: "Sign in again." };
  if (user.passwordHash === null) {
    try {
      const recoveryCode = newRecoveryCode(random);
      await withGoogleConfirmation("recovery-code", async (tx, confirmed) => {
        await tx.update(users).set({ recoveryHash: recoveryHashOf(recoveryCode) }).where(eq(users.id, confirmed.id));
      });
      return { kind: "ok", recoveryCode };
    } catch { return { kind: "refused", reason: "Confirm Google again for this operation." }; }
  }
  if (!parsed.data.signInKey) return { kind: "wrong" };
  const until = lockedUntil(user, now);
  if (until) return lockedAnswer(until);
  const stored = user.passwordHash;
  const checked = await hashes.run(() => verifyPassword(parsed.data.signInKey!, stored));
  if (!checked.ok) return { kind: "refused", reason: BUSY };
  if (!checked.value) {
    const locked = await countFailure(user.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }
  const recoveryCode = newRecoveryCode(random);
  const [replaced] = await db
    .update(users)
    .set({ recoveryHash: recoveryHashOf(recoveryCode), failedLogins: 0, lockedUntil: null })
    .where(unchangedCredential(user, stored))
    .returning({ id: users.id });
  if (!replaced) return { kind: "wrong" };
  return { kind: "ok", recoveryCode };
}

/**
 * Deletes the signed-in account and everything in it — every account, every
 * movement, every holding: each of those rows belongs to the account and goes
 * with it (ON DELETE CASCADE from `users`). Nothing is kept and nothing can
 * bring it back, so it asks for the password and for the email typed out.
 *
 * Not the owner's account: everything the site recorded before accounts
 * existed is in it, and losing that to one mistaken press is not a risk worth
 * a button.
 */
export async function deleteAccount(raw: unknown): Promise<DeleteOutcome> {
  const parsed = DeleteRequest.safeParse(raw);
  if (!parsed.success) return { kind: "wrong" };
  const userId = await currentUserId();
  if (!userId) return { kind: "refused", reason: "Sign in again." };
  if (userId === OWNER_USER_ID) {
    return { kind: "refused", reason: "The owner's account holds everything from before accounts, and is not deleted from here." };
  }
  const now = new Date();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.email === null) return { kind: "refused", reason: "Sign in again." };
  if (normalizeEmail(parsed.data.confirmEmail) !== user.email) {
    return { kind: "refused", reason: "Type your account's email exactly, to confirm." };
  }
  if (user.passwordHash === null) {
    try {
      await withGoogleConfirmation("delete", async (tx, confirmed) => {
        if (confirmed.id === OWNER_USER_ID || confirmed.email !== normalizeEmail(parsed.data.confirmEmail)) throw new Error("Invalid confirmation");
        await tx.delete(users).where(eq(users.id, confirmed.id));
      });
      (await cookies()).delete(SESSION_COOKIE_NAME);
      return { kind: "deleted" };
    } catch { return { kind: "refused", reason: "Confirm Google again for this operation." }; }
  }
  if (!parsed.data.signInKey) return { kind: "wrong" };
  const until = lockedUntil(user, now);
  if (until) return lockedAnswer(until);
  const stored = user.passwordHash;
  const checked = await hashes.run(() => verifyPassword(parsed.data.signInKey!, stored));
  if (!checked.ok) return { kind: "refused", reason: BUSY };
  if (!checked.value) {
    const locked = await countFailure(user.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }
  const [deleted] = await db.delete(users).where(unchangedCredential(user, stored)).returning({ id: users.id });
  if (!deleted) return { kind: "wrong" };
  (await cookies()).delete(SESSION_COOKIE_NAME);
  return { kind: "deleted" };
}

/** The signed-in account's email, for Settings. */
export async function accountEmail(): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return user?.email ?? null;
}
