"use server";

import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { authIdentities, users } from "@/db/schema";
import { KEY_HEX } from "@/lib/accounts/credentials";
import { hashPassword } from "@/lib/accounts/password";
import { GOOGLE_ERRORS, GOOGLE_ISSUER } from "@/lib/accounts/google";
import { newSessionValue, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";
import { requireServerSession } from "./requestSession";
import { admitted } from "./attemptGate";
import { googleAccountState, googlePasswordMatches, withGoogleConfirmation } from "./googleFlow";
import { accountHashes } from "./passwordWork";
import { currentUserId } from "./session";

export async function setGooglePassword(raw: unknown) {
  await requireServerSession();
  const { signInKey } = z.object({ signInKey: z.string().regex(KEY_HEX) }).strict().parse(raw);
  if (!(await admitted("google"))) return { kind: "refused", reason: GOOGLE_ERRORS.failed };
  const state = await googleAccountState();
  if (state.hasPassword || state.confirmation !== "set-password") return { kind: "refused", reason: GOOGLE_ERRORS.expired };
  // The one-use Google confirmation is checked again after slow hashing.
  const hashed = await accountHashes.run(() => hashPassword(signInKey, n => new Uint8Array(randomBytes(n))));
  if (!hashed.ok) return { kind: "refused", reason: GOOGLE_ERRORS.failed };
  try {
    const result = await withGoogleConfirmation("set-password", async (tx, user) => {
      if (user.passwordHash) throw new Error(GOOGLE_ERRORS.failed);
      const issuedAt = new Date(Date.now() + 1);
      await tx.update(users).set({ passwordHash: hashed.value, passwordKind: "keyed", authVersion: sql`${users.authVersion} + 1`, sessionsNotBefore: issuedAt }).where(eq(users.id, user.id));
      return { id: user.id, issuedAt };
    });
    (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(result.id, result.issuedAt), sessionCookieOptions());
    return { kind: "ok" };
  } catch { return { kind: "refused", reason: GOOGLE_ERRORS.expired }; }
}

export async function disconnectGoogle(raw: unknown) {
  await requireServerSession();
  const session = await currentUserId();
  if (!session) return { kind: "refused", reason: GOOGLE_ERRORS.expired };
  const { signInKey } = z.object({ signInKey: z.string().regex(KEY_HEX) }).strict().parse(raw);
  if (!(await admitted("google"))) return { kind: "refused", reason: GOOGLE_ERRORS.failed };
  const [user] = await db.select().from(users).where(eq(users.id, session));
  if (!user?.passwordHash) return { kind: "refused", reason: GOOGLE_ERRORS.last };
  if (!(await googlePasswordMatches(signInKey, user))) return { kind: "refused", reason: GOOGLE_ERRORS.password };
  const issuedAt = new Date(Date.now() + 1);
  const removed = await db.transaction(async tx => {
    const [changed] = await tx.update(users).set({ authVersion: sql`${users.authVersion} + 1`, sessionsNotBefore: issuedAt })
      .where(and(eq(users.id, user.id), eq(users.authVersion, user.authVersion), eq(users.passwordHash, user.passwordHash!), user.sessionsNotBefore ? eq(users.sessionsNotBefore, user.sessionsNotBefore) : isNull(users.sessionsNotBefore))).returning({ id: users.id });
    if (!changed) return false;
    await tx.delete(authIdentities).where(and(eq(authIdentities.userId, user.id), eq(authIdentities.issuer, GOOGLE_ISSUER)));
    return true;
  });
  if (!removed) return { kind: "refused", reason: GOOGLE_ERRORS.expired };
  (await cookies()).set(SESSION_COOKIE_NAME, await newSessionValue(user.id, issuedAt), sessionCookieOptions());
  return { kind: "ok" };
}
