"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, expectedSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const ok = await checkPassword(password);
  if (!ok) {
    redirect("/login?error=1");
  }
  const value = await expectedSessionValue();
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true", // set to "true" if served over HTTPS (e.g. behind a TLS-terminating proxy)
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}
