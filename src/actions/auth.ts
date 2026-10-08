"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { asUser, db } from "@/db/client";
import { categories, exchangeRates, OWNER_USER_ID, users } from "@/db/schema";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/db/defaultCategories";
import { newSessionValue, ownerPassword, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import {
  KEY_HEX,
  newRecoveryCode,
  normalizeEmail,
  recoveryHashOf,
  sameKey,
  signInKeyFor,
} from "@/lib/accounts/credentials";
import { createGate } from "@/lib/accounts/gate";
import { afterFailedLogin, lockedUntil, maxAccounts, registrationRefusal } from "@/lib/accounts/limits";
import { hashPassword, needsRehash, PASSWORD_MAX, verifyPassword } from "@/lib/accounts/password";
import type { DeleteOutcome, RecoveryOutcome, SignInOutcome, SignUpOutcome } from "@/lib/accounts/outcomes";
import { currentUserId } from "./session";
import { refreshRates } from "./fx";

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
const hashes = createGate({ running: 2, waiting: 8 });
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
const SignUpRequest = z.object({ email, signInKey }).strict();
const RecoverRequest = z.object({ email, recoveryCode: z.string().max(64), signInKey }).strict();
const NewCodeRequest = z.object({ signInKey }).strict();
const DeleteRequest = z.object({ signInKey, confirmEmail: z.string().max(254) }).strict();

async function startSession(userId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(userId), sessionCookieOptions());
}

/** One more wrong attempt against an account, counted in SQL so a burst cannot count as one. */
async function countFailure(userId: string, now: Date): Promise<Date | null> {
  const [counted] = await db
    .update(users)
    .set({ failedLogins: sql`${users.failedLogins} + 1` })
    .where(eq(users.id, userId))
    .returning({ failedLogins: users.failedLogins });
  if (!counted) return null;
  const next = afterFailedLogin(counted.failedLogins - 1, now);
  if (next.lockedUntil !== null) await db.update(users).set(next).where(eq(users.id, userId));
  return next.lockedUntil;
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
  await db.transaction(async (tx) => {
    // An account from the vault with the owner's own address has nothing in it
    // (a vault's money stayed on its devices): the owner's account takes the address.
    await tx.delete(users).where(and(eq(users.email, address), sql`${users.id} <> ${OWNER_USER_ID}`));
    await tx
      .update(users)
      .set({
        email: address,
        passwordHash: hashed.value,
        passwordKind: "keyed",
        recoveryHash: recoveryHashOf(recoveryCode),
        failedLogins: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, OWNER_USER_ID));
  });
  await startSession(OWNER_USER_ID);
  return { kind: "new-code", recoveryCode };
}

export async function signIn(raw: unknown): Promise<SignInOutcome> {
  const parsed = SignInRequest.safeParse(raw);
  if (!parsed.success) return { kind: "wrong" };
  const { email: address, signInKey: key, password } = parsed.data;
  const now = new Date();

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
  await db
    .update(users)
    .set({
      failedLogins: 0,
      lockedUntil: null,
      ...(renewed?.ok ? { passwordHash: renewed.value, passwordKind: "keyed" } : {}),
      ...(recoveryCode ? { recoveryHash: recoveryHashOf(recoveryCode) } : {}),
    })
    .where(eq(users.id, user.id));
  await asUser(user.id, ensureStartingData);
  await startSession(user.id);
  return recoveryCode ? { kind: "new-code", recoveryCode } : { kind: "ok" };
}

/** Accounts made so far, and in the last hour and day, for `registrationRefusal`. */
async function registrationCounts() {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      lastHour: sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '1 hour')::int`,
      lastDay: sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '1 day')::int`,
    })
    .from(users);
  return counts;
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

/**
 * What an account starts with, for one that has nothing yet: every new one,
 * and the vault's accounts, which arrived with a sign-in and no categories.
 * Run as the account, so the rows are its own.
 */
async function ensureStartingData(): Promise<void> {
  await ensureRates();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(categories);
  if (row && row.n > 0) return;
  await seedNewAccount();
}

/** How long a sign-in waits for the rate provider before going ahead without it. */
const RATES_WAIT_MS = 5000;

/**
 * Exchange rates, for an account that has none.
 *
 * They are each person's own rows (`exchange_rates` has a `user_id`), and a new
 * account started with none at all: a dollar share or a USD account was left
 * out of every total — Analysis said "Nothing to analyse yet" beside a position
 * — until the person happened to open Connections or the rates page, or the
 * home computer's scheduled sync ran. A provider that fails or hangs leaves it
 * as it was: `refreshRates` never throws, and signing in waits for it at most
 * `RATES_WAIT_MS`.
 */
async function ensureRates(): Promise<void> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(exchangeRates);
  if (row && row.n > 0) return;
  await Promise.race([refreshRates(), new Promise((resolve) => setTimeout(resolve, RATES_WAIT_MS))]);
}

/** What every new account starts with. */
async function seedNewAccount(): Promise<void> {
  const rows = [
    ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, kind: "income" })),
    ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, kind: "expense" })),
  ];
  await db.insert(categories).values(rows).onConflictDoNothing();
}

export async function signUp(raw: unknown): Promise<SignUpOutcome> {
  const parsed = SignUpRequest.safeParse(raw);
  if (!parsed.success) return { kind: "refused", reason: "Write a valid email address." };
  const { email: address, signInKey: key } = parsed.data;

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
    const [made] = await db
      .insert(users)
      .values({ email: address, passwordHash: hashed.value, passwordKind: "keyed", recoveryHash: recoveryHashOf(recoveryCode) })
      .returning({ id: users.id });
    userId = made.id;
  } catch (error) {
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
  const [recovered] = await db
    .update(users)
    .set({
      passwordHash: hashed.value,
      passwordKind: "keyed",
      recoveryHash: recoveryHashOf(next),
      failedLogins: 0,
      lockedUntil: null,
      sessionsNotBefore: now,
    })
    // The slow hash allows another request to consume or replace the code.
    // Check it again atomically with the write, not in a second SELECT.
    .where(and(eq(users.id, user.id), eq(users.recoveryHash, presented)))
    .returning({ id: users.id });
  if (!recovered) return { kind: "wrong" };
  await startSession(user.id);
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
  if (!user || user.passwordHash === null) return { kind: "refused", reason: "Sign in again." };
  const until = lockedUntil(user, now);
  if (until) return lockedAnswer(until);
  const stored = user.passwordHash;
  const checked = await hashes.run(() => verifyPassword(parsed.data.signInKey, stored));
  if (!checked.ok) return { kind: "refused", reason: BUSY };
  if (!checked.value) {
    const locked = await countFailure(user.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }
  const recoveryCode = newRecoveryCode(random);
  await db
    .update(users)
    .set({ recoveryHash: recoveryHashOf(recoveryCode), failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, userId));
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
  if (!user || user.passwordHash === null || user.email === null) return { kind: "refused", reason: "Sign in again." };
  if (normalizeEmail(parsed.data.confirmEmail) !== user.email) {
    return { kind: "refused", reason: "Type your account's email exactly, to confirm." };
  }
  const until = lockedUntil(user, now);
  if (until) return lockedAnswer(until);
  const stored = user.passwordHash;
  const checked = await hashes.run(() => verifyPassword(parsed.data.signInKey, stored));
  if (!checked.ok) return { kind: "refused", reason: BUSY };
  if (!checked.value) {
    const locked = await countFailure(user.id, now);
    return locked ? lockedAnswer(locked) : { kind: "wrong" };
  }
  await db.delete(users).where(eq(users.id, userId));
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
