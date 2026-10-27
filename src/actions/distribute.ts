"use server";

import { db } from "@/db/client";
import { buckets, bucketAllocations, accounts, auditLog } from "@/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { listAccountsWithState } from "./accounts";
import { listPurposes } from "./purpose";
import { getRates } from "./fx";
import { toBase, fromBase } from "@/lib/fx";
import { manualAmount, isQuickEntryId } from "@/lib/money/manualEntry";
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

async function buildDistribution(
  amount: number,
  strategy: Strategy = "priority",
  overrideShares?: Share[]
) {
  const [goals, accountList, base, rates] = await Promise.all([
    listGoalsByPriority(),
    listAccountsWithState(),
    getBaseCurrency(),
    getRates(),
  ]);

  const targets: DistributableBucket[] = goals.map((g) => ({
    id: g.id,
    name: g.name,
    priority: g.priority,
    current: g.current,
    target: g.target,
  }));

  const unconverted: { amount: number; currency: string }[] = [];
  const sources: Source[] = accountList.flatMap(a => {
    if (a.free <= 0) return [];
    const free = toBase(a.free, a.currency, rates, base);
    if (free === null) { unconverted.push({ amount: a.free, currency: a.currency }); return []; }
    return [{ accountId: a.id, accountName: a.name, free }];
  });

  // Hand-edited shares are normalised back to 100 rather than rejected. Someone
  // typing 30/30 means "equal", not "distribute 60% of it".
  const shares =
    overrideShares && overrideShares.length > 0
      ? normaliseShares(overrideShares)
      : weightsFromPriority(goals);

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount with at most two decimal places.");
  const plan = planWith(strategy, Math.min(amount, totalFree(sources)), targets, shares);
  const sourced = assignSources(plan.moves, sources);

  const nativeLeft = new Map(accountList.map(a => [a.id, Math.max(0,a.free)]));
  return {
    baseCurrency: base,
    available: totalFree(sources),
    strategy,
    shares,
    ...plan,
    sourcedMoves: sourced.moves,
    unfunded: sourced.unfunded,
    unconverted,
    // Private server input for optimistic validation under account row locks.
    accountState: accountList.map(a => ({ id: a.id, currency: a.currency, balance: a.balance, allocated: a.allocated,
      investedValue: a.investedValue, balanceMeaning: a.balanceMeaning })),
    nativeMoves: sourced.moves.map(move => {
      const account = accountList.find(a => a.id === move.accountId)!;
      const nativeAmount = fromBase(move.amount, account.currency, rates, base);
      if (nativeAmount === null) throw new Error("Refresh exchange rates before distributing money.");
      const capped = Math.round(Math.min(nativeAmount, nativeLeft.get(account.id) ?? 0) * 100) / 100;
      nativeLeft.set(account.id, Math.round(((nativeLeft.get(account.id) ?? 0) - capped) * 100) / 100);
      return { ...move, nativeAmount: capped, currency: account.currency };
    }),
  };
}

export async function planDistribution(amount: number, strategy: Strategy = "priority", overrideShares?: Share[]) {
  const plan = await buildDistribution(amount, strategy, overrideShares);
  const { accountState: _accountState, nativeMoves: _nativeMoves, ...view } = plan;
  void _accountState; void _nativeMoves;
  return view;
}

/**
 * Applies a plan.
 *
 * Recomputed from the amount rather than trusting numbers posted back from the
 * page: the balances may have moved since it was rendered, and a stale plan
 * would allocate money that has already gone somewhere else.
 */
export async function applyDistribution(formData: FormData) {
  const amount = Number(manualAmount(String(formData.get("amount") ?? "")));
  const requestId = String(formData.get("requestId") ?? "");
  if (!isQuickEntryId(requestId)) throw new Error("Preview the distribution again before applying it.");

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

  const plan = await buildDistribution(amount, strategy, shares);

  const details = JSON.stringify({ amount, strategy, shares: plan.shares });
  await db.transaction(async store => {
    // A receipt survives later changes to goals and makes a lost response safe
    // to retry. Unique insertion serialises copies from different devices.
    const receiptId = `${requestId}-distribution`;
    const [receipt] = await store.insert(auditLog).values({ id: receiptId, entityType: "bucket", entityId: "distribution", action: "money_distributed", details })
      .onConflictDoNothing({ target: auditLog.id }).returning();
    if (!receipt) {
      const [previous] = await store.select().from(auditLog).where(eq(auditLog.id, receiptId));
      if (previous?.details !== details) throw new Error("This distribution request was already used with different details.");
      return;
    }
    const accountIds = [...new Set(plan.nativeMoves.map(m => m.accountId))];
    const goalIds = [...new Set(plan.nativeMoves.map(m => m.bucketId))];
    if (!accountIds.length) throw new Error("No available money can be distributed. Preview again.");
    const locked = await store.select().from(accounts).where(inArray(accounts.id, accountIds)).orderBy(asc(accounts.id)).for("update");
    const goals = await store.select().from(buckets).where(inArray(buckets.id, goalIds)).orderBy(asc(buckets.id)).for("update");
    if (locked.length !== accountIds.length || goals.length !== goalIds.length) throw new Error("Balances or goals changed. Preview the distribution again.");
    const allocations = await store.select().from(bucketAllocations).where(inArray(bucketAllocations.accountId, accountIds));
    for (const account of locked) {
      const before = plan.accountState.find(a => a.id === account.id)!;
      const allocated = Math.round(allocations.filter(a => a.accountId === account.id).reduce((sum, a) => sum + Number(a.amount), 0) * 100) / 100;
      if (!account.active || account.currency !== before.currency || Number(account.balance) !== before.balance || allocated !== before.allocated ||
        account.investedValue !== before.investedValue || account.balanceMeaning !== before.balanceMeaning) {
        throw new Error("Balances or goals changed. Preview the distribution again.");
      }
    }
    for (const move of plan.nativeMoves) {
      if (move.nativeAmount <= 0) continue;
      const pair = and(eq(bucketAllocations.accountId, move.accountId), eq(bucketAllocations.bucketId, move.bucketId));
      const previous = allocations.filter(a => a.accountId === move.accountId && a.bucketId === move.bucketId);
      const total = previous.reduce((sum,a) => sum + Number(a.amount),0) + move.nativeAmount;
      await store.delete(bucketAllocations).where(pair);
      await store.insert(bucketAllocations).values({ accountId: move.accountId, bucketId: move.bucketId, amount: total.toFixed(2) });
    }
  });

  revalidatePath("/buckets");
  revalidatePath("/accounts");
  revalidatePath("/");
}

export async function submitDistribution(formData: FormData) {
  try { await applyDistribution(formData); return { saved: true }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expected = ["Enter a positive amount with at most two decimal places.", "Preview the distribution again before applying it.",
      "Balances or goals changed. Preview the distribution again.", "No available money can be distributed. Preview again.",
      "This distribution request was already used with different details.", "Refresh exchange rates before distributing money."];
    return { error: expected.includes(message) ? message : "Could not save. Retry with the same details." };
  }
}
