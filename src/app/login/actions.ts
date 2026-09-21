"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newSessionValue, sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";
import { attemptSiteLogin } from "@/actions/siteLogin";

/**
 * Forgets the session on this device. Its cookie is still a valid session
 * until it expires — "Log out other devices" in Settings is what ends them all.
 */
export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  // Limited: ten wrong passwords lock the login for a while — see `attemptSiteLogin`.
  const result = await attemptSiteLogin(password);
  if (!result.ok) {
    redirect(result.lockedUntil ? "/login?error=locked" : "/login?error=1");
  }
  // A session of its own for this device, issued only here, after the password.
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, await newSessionValue(), sessionCookieOptions());
  redirect("/");
}
