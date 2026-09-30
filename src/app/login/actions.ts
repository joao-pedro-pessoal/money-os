"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { syncLoginMethods } from "@/db/schema";
import { newSessionValue, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { attemptSiteLogin } from "@/actions/siteLogin";
import { loginSyncAccount } from "@/actions/vaultServer";
import { normalizeEmail, ownerEmailFrom, signInRoute, type SignInOutcome } from "@/lib/signInRoute";

/**
 * Forgets the session on this device. Its cookie is still a valid session
 * until it expires — "Log out other devices" in Settings is what ends them all.
 */
export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

const SignInRequest = z
  .object({
    email: z.string().max(254),
    password: z.string().max(1024),
    deviceName: z.string().trim().min(1).max(80),
  })
  .strict();

/**
 * Whether an email has a vault account that signs in with a password.
 *
 * Not exported: every export of this module is an endpoint, and this one
 * would tell anyone which emails have an account here.
 */
async function hasPasswordVault(email: string): Promise<boolean> {
  const [method] = await db
    .select({ id: syncLoginMethods.id })
    .from(syncLoginMethods)
    .where(and(eq(syncLoginMethods.kind, "password"), eq(syncLoginMethods.subject, email)));
  return method !== undefined;
}

/**
 * The sign-in page's one button: the owner into the site, anyone else into
 * their vault. See lib/signInRoute.ts for which is which.
 *
 * Each path keeps its own limit on guessing — the site's in `attemptSiteLogin`,
 * each vault account's in `loginSyncAccount` — and a wrong password gets the
 * same answer on both.
 */
export async function signIn(raw: unknown): Promise<SignInOutcome> {
  const parsed = SignInRequest.safeParse(raw);
  if (!parsed.success) return { kind: "wrong" };
  const email = normalizeEmail(parsed.data.email);
  const { password, deviceName } = parsed.data;
  if (email === "" || password === "") return { kind: "wrong" };

  const ownerEmail = ownerEmailFrom(process.env.APP_EMAIL);
  const route = signInRoute({
    email,
    ownerEmail,
    hasVaultAccount: ownerEmail === null && (await hasPasswordVault(email)),
  });

  if (route === "owner") {
    // Limited: ten wrong passwords lock the login for a while — see `attemptSiteLogin`.
    const result = await attemptSiteLogin(password);
    if (!result.ok) {
      return result.lockedUntil ? { kind: "locked", until: result.lockedUntil.toISOString() } : { kind: "wrong" };
    }
    // A session of its own for this device, issued only here, after the password.
    const store = await cookies();
    store.set(SESSION_COOKIE_NAME, await newSessionValue(), sessionCookieOptions());
    return { kind: "owner" };
  }

  const result = await loginSyncAccount({ email, password, deviceName });
  if (!result.ok) {
    return result.status === 400 || result.status === 401 ? { kind: "wrong" } : { kind: "refused", reason: result.reason };
  }
  return {
    kind: "vault",
    session: { token: result.token, userId: result.userId, deviceId: result.deviceId, email },
  };
}
