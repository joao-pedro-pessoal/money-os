// Internal server helper. No "use server": arbitrary-account reads must never
// become callable Server Actions. Callers pass only a server-verified identity.
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { cache } from "react";

const pending = new Map<string, Promise<Date | null>>();

async function readSessionsNotBefore(userId: string): Promise<Date | null> {
  const [row] = await db.select({ notBefore: users.sessionsNotBefore }).from(users).where(eq(users.id, userId));
  return row ? row.notBefore : new Date(8.64e15);
}

// React memoization ends with the server render; it is never a cross-request TTL.
const readForRequest = cache(readSessionsNotBefore);

/** Concurrent readers share only the pending query; the next request reads anew. */
export async function sessionsNotBefore(userId: string): Promise<Date | null> {
  const hit = pending.get(userId);
  if (hit) return hit;
  const value = readForRequest(userId);
  pending.set(userId, value);
  const clear = () => { if (pending.get(userId) === value) pending.delete(userId); };
  value.then(clear, clear);
  return value;
}

export function forgetSessionRevocation(userId: string): void {
  pending.delete(userId);
}
