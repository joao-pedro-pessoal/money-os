"use server";

import { db } from "@/db/client";
import { loginThrottle } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { checkPassword } from "@/lib/auth";
import { afterFailedLogin, lockedUntil } from "@/lib/vault/protocol";

/**
 * The site's password, checked with a limit on guessing.
 *
 * The vault's login already locked after ten wrong passwords; the site's own
 * login answered every guess, as fast as they came. On the house Wi-Fi that
 * was a small risk. Reachable from outside (E01) it is the whole of the
 * protection, so the same policy applies here — `afterFailedLogin`, not a
 * second copy of it: ten failures lock the login for fifteen minutes.
 *
 * During a lockout the password is not checked at all. Checking it and
 * refusing a right one would still tell a guesser when they had found it.
 */

const KEY = "site";

export type SiteLoginResult = { ok: true } | { ok: false; lockedUntil: Date | null };

export async function attemptSiteLogin(password: string): Promise<SiteLoginResult> {
  const now = new Date();
  const [row] = await db.select().from(loginThrottle).where(eq(loginThrottle.key, KEY));
  const until = row ? lockedUntil(row, now) : null;
  if (until) return { ok: false, lockedUntil: until };

  if (await checkPassword(password)) {
    if (row && (row.failedLogins > 0 || row.lockedUntil !== null)) {
      await db
        .update(loginThrottle)
        .set({ failedLogins: 0, lockedUntil: null, updatedAt: now })
        .where(eq(loginThrottle.key, KEY));
    }
    return { ok: true };
  }

  /**
   * Counted in SQL, not from the row just read, as the vault does: parallel
   * guesses reading the same count would each write it plus one, and a burst
   * would register as a single failure.
   */
  const [counted] = await db
    .insert(loginThrottle)
    .values({ key: KEY, failedLogins: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: loginThrottle.key,
      set: { failedLogins: sql`${loginThrottle.failedLogins} + 1`, updatedAt: now },
    })
    .returning({ failedLogins: loginThrottle.failedLogins });
  const next = afterFailedLogin(counted.failedLogins - 1, now);
  if (next.lockedUntil !== null) {
    await db
      .update(loginThrottle)
      .set({ ...next, updatedAt: now })
      .where(eq(loginThrottle.key, KEY));
  }
  return { ok: false, lockedUntil: next.lockedUntil };
}

/** When the site's login opens again, or null when it is open. */
export async function siteLoginLockedUntil(): Promise<Date | null> {
  const [row] = await db.select().from(loginThrottle).where(eq(loginThrottle.key, KEY));
  return row ? lockedUntil(row, new Date()) : null;
}
