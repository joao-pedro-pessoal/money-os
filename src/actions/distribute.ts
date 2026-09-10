"use server";

import { db } from "@/db/client";
import { buckets, bucketAllocations, auditLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { listAccountsWithState } from "./accounts";
import { listPurposes } from "./purpose";
import { getBaseCurrency } from "./settings";
import {
  assignSources,
  byPriority,
  totalFree,
  planWith,
  weightsFromPriority,
  normaliseShares,
  isStrategy,
  type DistributableBucket,
  type Source,
  type Share,
  type Strategy,
} from "@/lib/accounting/distribute";

/** Goals in the order they should be filled. */
export async function listGoalsByPriority() {
  const [rows, purposes] = await Promise.all([db.select().from(buckets), listPurposes()]);
  const totals = new Map(purposes.purposes.map((p) => [p.id, p.totals.total]));

  return byPriority(
    rows.map((b) => ({
      id: b.id,
      name: b.name,
      priority: Number(b.priority),
      current: totals.get(b.id) ?? 0,
      target: b.targetAmount === null ? null : Number(b.targetAmount),
      color: b.color,
    }))
  );
}

export async function setPriority(formData: FormData) {
  const id = String(formData.get("id"));
  const priority = Number(formData.get("priority"));

  if (!Number.isFinite(priority)) throw new Error("Priority must be a number.");

  await db
    .update(buckets)
    .set({ priority: String(Math.max(0, Math.round(priority))) })
    .where(eq(buckets.id, id));

  revalidatePath("/buckets");
  revalidatePath("/");
}

/**
 * Nudges one goal's rank by one.
 *
 * Deliberately NOT a renumber of the whole list. The first version rewrote
 * every priority as 0..n on each move, which quietly destroyed ties — and ties
 * are the point: "these two matter the same" is a real thing to want to say,
 * and it's what makes an equal share possible.
 *
 * So this changes one number, and two goals meeting at the same value stay
 * there until you move one of them again.
 */
export async function moveGoal(formData: FormData) {
  const id = String(formData.get("id"));
  const up = String(formData.get("direction")) === "up";

  const [row] = await db.select().from(buckets).where(eq(buckets.id, id));
  if (!row) return;

  const current = Number(row.priority);
  const next = Math.max(0, current + (up ? -1 : 1));

  await db.update(buckets).set({ priority: String(next) }).where(eq(buckets.id, id));

  revalidatePath("/buckets");
  revalidatePath("/");
}

/**
 * Works out where an amount should go, and from which account.
 *
 * Nothing is written. This is a proposal you look at and then choose to apply —
 * a plan that moves money the moment you type a number into a box is not a
 * plan, it's an accident waiting to happen.
 */
/** The split the priority ranking implies, before any hand-editing. */
export async function getDefaultShares(): Promise<Share[]> {
  const goals = await listGoalsByPriority();
  return weightsFromPriority(goals);
}

export async function planDistribution(
  amount: number,
  strategy: Strategy = "priority",
  overrideShares?: Share[]
) {
  const [goals, accountList, base] = await Promise.all([
    listGoalsByPriority(),
    listAccountsWithState(),
    getBaseCurrency(),
  ]);

  const targets: DistributableBucket[] = goals.map((g) => ({
    id: g.id,
    name: g.name,
    priority: g.priority,
    current: g.current,
    target: g.target,
  }));

  const sources: Source[] = accountList
    // Free cash, not the balance: the rest is already promised to other goals,
    // and moving it twice is how a bucket ends up holding money that isn't there.
    .filter((a) => a.free > 0)
    .map((a) => ({ accountId: a.id, accountName: a.name, free: a.free }));

  // Hand-edited shares are normalised back to 100 rather than rejected. Someone
  // typing 30/30 means "equal", not "distribute 60% of it".
  const shares =
    overrideShares && overrideShares.length > 0
      ? normaliseShares(overrideShares)
      : weightsFromPriority(goals);

  const plan = planWith(strategy, amount, targets, shares);
  const sourced = assignSources(plan.moves, sources);

  return {
    baseCurrency: base,
    available: totalFree(sources),
    strategy,
    shares,
    ...plan,
    sourcedMoves: sourced.moves,
    unfunded: sourced.unfunded,
  };
}

/**
 * Applies a plan.
 *
 * Recomputed from the amount rather than trusting numbers posted back from the
 * page: the balances may have moved since it was rendered, and a stale plan
 * would allocate money that has already gone somewhere else.
 */
export async function applyDistribution(formData: FormData) {
  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount to distribute.");

  const rawStrategy = String(formData.get("strategy") ?? "priority");
  const strategy: Strategy = isStrategy(rawStrategy) ? rawStrategy : "priority";

  // The shares travel as JSON so a hand-edited split survives the round trip.
  let shares: Share[] | undefined;
  try {
    const raw = String(formData.get("shares") ?? "");
    if (raw) shares = JSON.parse(raw) as Share[];
  } catch {
    shares = undefined;
  }

  const plan = await planDistribution(amount, strategy, shares);

  for (const move of plan.sourcedMoves) {
    const [existing] = await db
      .select()
      .from(bucketAllocations)
      .where(
        and(
          eq(bucketAllocations.accountId, move.accountId),
          eq(bucketAllocations.bucketId, move.bucketId)
        )
      );

    if (existing) {
      await db
        .update(bucketAllocations)
        .set({ amount: String(Number(existing.amount) + move.amount), updatedAt: new Date() })
        .where(eq(bucketAllocations.id, existing.id));
    } else {
      await db.insert(bucketAllocations).values({
        accountId: move.accountId,
        bucketId: move.bucketId,
        amount: String(move.amount),
      });
    }
  }

  await db.insert(auditLog).values({
    entityType: "bucket",
    entityId: "distribution",
    action: "money_distributed",
    details: JSON.stringify({
      amount,
      strategy,
      distributed: plan.distributed,
      moves: plan.sourcedMoves.map((m) => `${m.amount} ${m.accountName} → ${m.bucketName}`),
    }),
  });

  revalidatePath("/buckets");
  revalidatePath("/accounts");
  revalidatePath("/");
}
