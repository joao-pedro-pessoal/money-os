// Internal distributed quota/lease implementation. Never a Server Action.
import { createHmac, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { workGates } from "@/db/schema";
import { clientAddress } from "@/lib/accounts/attempts";
import { nextAdmission, WORK_LIMITS, type Lease, type WorkKind } from "@/lib/accounts/workLimits";
import { requireServerSession } from "./requestSession";

export class WorkLimitedError extends Error {
  constructor(public readonly retryAfter: number) { super(`Too many requests. Try again in ${retryAfter} seconds.`); }
}

type Scope = { key: string; windows: readonly { seconds: number; max: number }[]; capacity: number };

function scopeKey(kind: WorkKind, scope: string) {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required for request quotas.");
  return createHmac("sha256", secret).update(`work|${kind}|${scope}`).digest("hex");
}

/** Same PostgreSQL state on every instance; all scopes admitted or none are. */
export async function acquireWork(kind: WorkKind): Promise<() => Promise<void>> {
  await requireServerSession();
  const identity = await db.execute<{ id: string; now: Date }>(sql`select current_setting('app.user_id', true) as id, clock_timestamp() as now`);
  const user = identity.rows[0];
  if (!user?.id) throw new Error("Sign in again.");
  const policy = WORK_LIMITS[kind];
  const scopes: Scope[] = [
    { key: scopeKey(kind, `user:${user.id}`), windows: policy.user, capacity: policy.simultaneous },
    { key: scopeKey(kind, "global"), windows: [], capacity: policy.global },
  ];
  // No connection header on the home copy: user and global quotas still apply.
  let address: string | null = null;
  try { address = clientAddress(await headers()); } catch { /* no request context */ }
  if (address) scopes.push({ key: scopeKey(kind, `connection:${address}`), windows: policy.connection, capacity: policy.global });
  return admitScopes(scopes);
}

/** Internal only: called by the scheduler route AFTER checking its secret. */
export async function withScheduledWork<T>(work: () => Promise<T>): Promise<T> {
  const policy = WORK_LIMITS["scheduled-sync"];
  const release = await admitScopes([{ key: scopeKey("scheduled-sync", "global"), windows: policy.user, capacity: 1 }]);
  try { return await work(); }
  finally { try { await release(); } catch { console.error("scheduled_gate_release_failed"); } }
}

async function admitScopes(scopes: Scope[]): Promise<() => Promise<void>> {
  scopes.sort((a, b) => a.key.localeCompare(b.key));
  const token = randomUUID();
  let cleanupTime = 0;
  await db.transaction(async tx => {
    // Get the database time after waiting for locks, avoiding process clock skew.
    const locked = [];
    for (const scope of scopes) {
      const [row] = await tx.insert(workGates).values({ key: scope.key })
        .onConflictDoUpdate({ target: workGates.key, set: { key: scope.key } }).returning();
      locked.push({ scope, row });
    }
    const time = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    const now = new Date(time.rows[0].now).getTime();
    cleanupTime = now;
    const admitted = locked.map(({ scope, row }) => ({ scope, next: nextAdmission(JSON.parse(row.history), JSON.parse(row.leases), scope.windows, scope.capacity, now) }));
    const wait = Math.max(...admitted.map(a => a.next.retryAfter));
    if (wait > 0) throw new WorkLimitedError(wait);
    for (const { scope, next } of admitted) {
      // Lease exceeds the configured 300 s handler deadline. Token ownership
      // means a delayed completion cannot release another execution's slot.
      await tx.update(workGates).set({
        history: JSON.stringify(scope.windows.length ? [...next.history, now] : []),
        leases: JSON.stringify([...next.leases, { token, until: now + 360_000 }]),
        updatedAt: new Date(now),
      }).where(eq(workGates.key, scope.key));
    }
  });
  // Cleanup holds no other gate locks, avoiding lock-order inversion with an
  // admission that is reviving an old scope. No personal content is retained.
  try { await db.delete(workGates).where(lt(workGates.updatedAt, new Date(cleanupTime - 86400_000))); }
  catch { console.error("work_gate_cleanup_failed"); }
  return async () => {
    for (const scope of scopes) await db.transaction(async tx => {
      const [row] = await tx.select().from(workGates).where(eq(workGates.key, scope.key)).for("update");
      if (!row) return;
      const leases = (JSON.parse(row.leases) as Lease[]).filter(lease => lease.token !== token);
      await tx.update(workGates).set({ leases: JSON.stringify(leases) }).where(eq(workGates.key, scope.key));
    });
  };
}

export async function withWork<T>(kind: WorkKind, work: () => Promise<T>): Promise<T> {
  const release = await acquireWork(kind);
  try { return await work(); }
  finally {
    // A release outage must not turn a committed financial operation into a
    // reported failure; the bounded lease expires independently.
    try { await release(); } catch { console.error("work_gate_release_failed"); }
  }
}
