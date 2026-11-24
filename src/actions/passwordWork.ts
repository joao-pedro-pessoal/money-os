// One bounded queue for every password hash/check, including Google method changes.
import { createGate } from "@/lib/accounts/gate";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { afterFailedLogin } from "@/lib/accounts/limits";
export const accountHashes = createGate({ running: 2, waiting: 8 });

export async function countFailure(userId: string, now: Date): Promise<Date | null> {
  const [counted] = await db.update(users).set({ failedLogins: sql`${users.failedLogins} + 1` }).where(eq(users.id, userId)).returning({ failedLogins: users.failedLogins });
  if (!counted) return null;
  const next = afterFailedLogin(counted.failedLogins - 1, now);
  if (next.lockedUntil !== null) await db.update(users).set(next).where(eq(users.id, userId));
  return next.lockedUntil;
}
