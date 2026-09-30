"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { endedBy, newSessionValue, readSession, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * The one answer to "who is signed in", for the proxy and every action that
 * checks for itself.
 *
 * What a session is — signed, in date, whose — is decided in `readSession`;
 * whether that person has since pressed "Log out other devices" is the date on
 * their row, read here. `users` has no row-level security (sign-in has to find
 * an account before anyone is signed in), so these reads work for anyone.
 */

/**
 * Read at most every thirty seconds per account.
 *
 * The proxy asks on every request, and the answer changes only when someone
 * presses "Log out other devices". The proxy may hold its own copy of this
 * module, so another device can keep going for up to thirty seconds after the
 * press; the device that pressed it is given a new session at once.
 */
const CACHE_MS = 30_000;
const cached = new Map<string, { value: Date | null; readAt: number }>();

export async function sessionsNotBefore(userId: string): Promise<Date | null> {
  const hit = cached.get(userId);
  if (hit && Date.now() - hit.readAt < CACHE_MS) return hit.value;
  const [row] = await db
    .select({ notBefore: users.sessionsNotBefore })
    .from(users)
    .where(eq(users.id, userId));
  // An account that no longer exists ends every session it had.
  const value = row ? row.notBefore : new Date(8.64e15);
  if (cached.size > 1000) cached.clear();
  cached.set(userId, { value, readAt: Date.now() });
  return value;
}

/** The signed-in account, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null);
  if (!session.valid) return null;
  return endedBy(await sessionsNotBefore(session.userId), session.issuedAt) ? null : session.userId;
}

/** Whether the request carries a session this site issued and nobody has ended. */
export async function hasSession(): Promise<boolean> {
  return (await currentUserId()) !== null;
}

/**
 * Ends every session of this account but this one — for a lost phone, or a
 * cookie that may have been seen. Every session issued before now is refused
 * from here on; this device is signed in again at once so the press does not
 * lock its owner out.
 */
export async function logOutOtherDevices(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Sign in again.");
  const now = new Date();
  await db.update(users).set({ sessionsNotBefore: now }).where(eq(users.id, userId));
  cached.set(userId, { value: now, readAt: Date.now() });
  (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(userId, now), sessionCookieOptions());
  revalidatePath("/settings");
}
