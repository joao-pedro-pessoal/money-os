"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * Forgets the session on this device. Its cookie is still a valid session
 * until it expires — "Log out other devices" in Settings is what ends them all.
 * Signing in, making an account and recovering one are in actions/auth.ts.
 */
export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
