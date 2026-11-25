// Internal coalescing between instances. No module-level personal data or RPCs.
import { randomUUID } from "node:crypto";
import { and, eq, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { privateSnapshots } from "@/db/schema";
import { requireServerSession } from "./requestSession";
import { WorkLimitedError } from "./workGate";

export const SNAPSHOT_TTL_MS = 15_000;
const MAX_SNAPSHOT_BYTES = 1024 * 1024;
const now = sql<Date>`clock_timestamp()`;

export async function privateSnapshot<T>(key: string, calculate: () => Promise<T>): Promise<{ value: T; generatedAt: string }> {
  await requireServerSession();
  if (!/^[a-z0-9:-]{1,100}$/.test(key)) throw new Error("Invalid private snapshot key.");
  const token = randomUUID();
  const deadline = Date.now() + 5_000;
  do {
    const [cached] = await db.select({ payload: privateSnapshots.payload, generatedAt: privateSnapshots.generatedAt })
      .from(privateSnapshots).where(and(eq(privateSnapshots.key, key), sql`${privateSnapshots.expiresAt} > ${now}`));
    if (cached?.payload && cached.generatedAt) return { value: JSON.parse(cached.payload) as T, generatedAt: cached.generatedAt.toISOString() };

    // UPSERT atomically claims only an expired snapshot with no live writer.
    // Nobody holds a connection/transaction while another request calculates.
    const [claim] = await db.insert(privateSnapshots).values({ key, expiresAt: now, leaseToken: token, leaseUntil: sql`${now} + interval '310 seconds'` })
      .onConflictDoUpdate({ target: [privateSnapshots.userId, privateSnapshots.key], set: { leaseToken: token, leaseUntil: sql`${now} + interval '310 seconds'` },
        setWhere: and(lte(privateSnapshots.expiresAt, now), lte(privateSnapshots.leaseUntil, now)),
      }).returning({ token: privateSnapshots.leaseToken });
    if (claim?.token === token) {
      try {
        const value = await calculate();
        const payload = JSON.stringify(value);
        const size = Buffer.byteLength(payload, "utf8");
        const [stored] = await db.update(privateSnapshots).set({
          payload: size <= MAX_SNAPSHOT_BYTES ? payload : null,
          generatedAt: now, expiresAt: size <= MAX_SNAPSHOT_BYTES ? sql`${now} + interval '15 seconds'` : now,
          leaseToken: null, leaseUntil: now,
        }).where(and(eq(privateSnapshots.key, key), eq(privateSnapshots.leaseToken, token)))
          .returning({ generatedAt: privateSnapshots.generatedAt });
        if (!stored?.generatedAt) throw new Error("Private snapshot authorization changed.");
        // Cleanup sees only this person's rows. Idle snapshots are also removed
        // by account deletion and explicitly during financial restore.
        await db.delete(privateSnapshots).where(and(lt(privateSnapshots.expiresAt, sql`${now} - interval '1 minute'`), lte(privateSnapshots.leaseUntil, now)));
        return { value, generatedAt: stored.generatedAt.toISOString() };
      } finally {
        await db.update(privateSnapshots).set({ leaseToken: null, leaseUntil: now })
          .where(and(eq(privateSnapshots.key, key), eq(privateSnapshots.leaseToken, token)));
      }
    }
    // A short wait joins a live calculation; a dead process cannot make the
    // caller wait its entire lease. HTTP callers receive 429/Retry-After.
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new WorkLimitedError(1);
}
