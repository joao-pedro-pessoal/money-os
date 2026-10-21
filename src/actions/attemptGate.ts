/**
 * The per-connection limit as a helper for the actions that need it: signing
 * in, making an account, recovering one, and starting a QR sign-in.
 *
 * Not a "use server" module, on purpose: exported from one of those, this would
 * be an endpoint anyone could call to fill the table.
 */
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { requestLimits } from "@/db/schema";
import { ATTEMPT_LIMITS, ATTEMPT_RETENTION_HOURS, clientAddress, originOf, overLimit, type AttemptAction } from "@/lib/accounts/attempts";

/**
 * Counts this attempt against the connection it came from (lib/accounts/attempts.ts),
 * or says the connection has made too many. Runs before any slow hash.
 *
 * With no address to go by — the home copy, which has no host in front of it —
 * nothing is limited here; the per-account and site-wide limits still are.
 */
export async function admitted(action: AttemptAction): Promise<boolean> {
  let address: string | null;
  try {
    address = clientAddress(await headers());
  } catch {
    return true;
  }
  if (!address) return true;
  const origin = originOf(address, process.env.APP_SECRET || "money-os-attempts");
  const windows = ATTEMPT_LIMITS[action];
  // Recorded first, then counted: a burst of parallel requests each sees the
  // ones recorded before it, so no more than the limit get through. Counting
  // first let every request in the burst read the same old count.
  const [mine] = await db.insert(requestLimits).values({ action, origin }).returning({ id: requestLimits.id, at: requestLimits.at });
  const [row] = await db
    .select(
      Object.fromEntries(
        windows.map((w, i) => [
          `w${i}`,
          sql<number>`count(*) filter (where ${requestLimits.at} > now() - make_interval(mins => ${w.minutes}))::int`,
        ])
      )
    )
    .from(requestLimits)
    .where(
      and(
        eq(requestLimits.action, action),
        eq(requestLimits.origin, origin),
        // Only the attempts recorded before this one, in a fixed order.
        sql`(${requestLimits.at}, ${requestLimits.id}) < (${mine.at}, ${mine.id})`
      )
    );
  if (overLimit(action, windows.map((_, i) => Number(row?.[`w${i}`] ?? 0)))) {
    // A refused attempt is not counted, so waiting is enough to be let in again.
    await db.delete(requestLimits).where(eq(requestLimits.id, mine.id));
    return false;
  }
  // This connection's old rows go every time (cheap, on the index); everyone
  // else's now and then, rather than a scan of the whole table per attempt.
  const old = sql`${requestLimits.at} < now() - make_interval(hours => ${ATTEMPT_RETENTION_HOURS})`;
  await db.delete(requestLimits).where(and(eq(requestLimits.action, action), eq(requestLimits.origin, origin), old));
  if (Math.random() < 0.05) await db.delete(requestLimits).where(old);
  return true;
}
