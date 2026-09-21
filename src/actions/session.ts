"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { newSessionValue, readSession, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * The one answer to "is this request signed in", for the proxy and every
 * action that checks for itself.
 *
 * Eight actions compared the cookie with the fixed session value inline, each
 * with its own copy of the comparison. They ask `hasSession` now, so what a
 * session is — signed, dated, not ended by "Log out other devices" — is decided
 * in `readSession` and nowhere else.
 */

const NOT_BEFORE_KEY = "sessions_not_before";

/**
 * Read at most every thirty seconds.
 *
 * The proxy asks on every request, and the answer changes only when someone
 * presses "Log out other devices". The proxy may hold its own copy of this
 * module, so another device can keep going for up to thirty seconds after the
 * press; the device that pressed it is given a new session at once.
 */
const CACHE_MS = 30_000;
let cached: { value: Date | null; readAt: number } | null = null;

export async function sessionsNotBefore(): Promise<Date | null> {
  if (cached !== null && Date.now() - cached.readAt < CACHE_MS) return cached.value;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, NOT_BEFORE_KEY));
  const parsed = row ? new Date(row.value) : null;
  const value = parsed !== null && Number.isFinite(parsed.getTime()) ? parsed : null;
  cached = { value, readAt: Date.now() };
  return value;
}

/** Whether the request carries a session this site issued and has not ended. */
export async function hasSession(): Promise<boolean> {
  const value = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!value) return false;
  return (await readSession(value, new Date(), await sessionsNotBefore())).valid;
}

/**
 * Gives this device a new session of its own.
 *
 * Not exported, and it must never be: every export of a "use server" module
 * is an endpoint anyone can call, and this one would hand a session to
 * whoever asked. The login form issues its own, after the password.
 */
async function startSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(), sessionCookieOptions());
}

/**
 * Ends every session but this one — for a lost phone, or a cookie that may
 * have been seen. Every session issued before now is refused from here on;
 * this device is signed in again at once so the press does not lock its
 * owner out.
 */
export async function logOutOtherDevices(): Promise<void> {
  if (!(await hasSession())) throw new Error("Sign in again.");
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: NOT_BEFORE_KEY, value: now.toISOString(), updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: now.toISOString(), updatedAt: now } });
  cached = { value: now, readAt: Date.now() };
  await startSession();
  revalidatePath("/settings");
}
