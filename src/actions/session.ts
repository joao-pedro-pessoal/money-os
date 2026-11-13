"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { endedBy, newSessionValue, readSession, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { forgetSessionRevocation, sessionsNotBefore } from "./sessionRevocation";

/**
 * The one answer to "who is signed in", for the proxy and every action that
 * checks for itself.
 *
 * What a session is — signed, in date, whose — is decided in `readSession`;
 * whether that person has since pressed "Log out other devices" is the date on
 * their row, read here. `users` has no row-level security (sign-in has to find
 * an account before anyone is signed in), so these reads work for anyone.
 */

/** The signed-in account, or null. */
export async function currentUserId(requiredUserId?: string): Promise<string | null> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null);
  // A server-side restriction can only narrow the signed identity, never select another one.
  if (!session.valid || (requiredUserId !== undefined && session.userId !== requiredUserId)) return null;
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
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE_NAME)?.value ?? null);
  if (!session.valid || session.userId !== userId) throw new Error("Sign in again.");
  const now = new Date(Date.now() + 1);
  const [updated] = await db.update(users).set({ sessionsNotBefore: now })
    .where(and(eq(users.id, userId), or(isNull(users.sessionsNotBefore), lte(users.sessionsNotBefore, session.issuedAt))))
    .returning({ id: users.id });
  if (!updated) throw new Error("Sign in again.");
  forgetSessionRevocation(userId);
  jar.set(SESSION_COOKIE_NAME, await newSessionValue(userId, now), sessionCookieOptions());
  revalidatePath("/settings");
}
