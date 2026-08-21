"use server";

import { db } from "@/db/client";
import { budgets, budgetCategories, categories, transactions } from "@/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getBaseCurrency } from "./settings";
import {
  envelopeState,
  periodBounds,
  shiftPeriod,
  periodProgress,
  isPacingOver,
  monthlyEquivalent,
  isPeriod,
  type Envelope,
  type Spend,
  type Period,
} from "@/lib/accounting/envelopes";

/** Expenses only. Income arriving does not "refund" a budget. */
async function loadSpending(): Promise<Spend[]> {
  const rows = await db.select().from(transactions).where(eq(transactions.type, "expense"));
  return rows.map((t) => ({
    date: new Date(t.date),
    amount: Number(t.amount),
    categoryId: t.categoryId,
  }));
}

async function loadEnvelopes(): Promise<Envelope[]> {
  const [rows, links] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.active, true)),
    db.select().from(budgetCategories),
  ]);

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    // A period written by an older version falls back to monthly rather than
    // producing bounds nobody can interpret.
    period: isPeriod(b.period) ? (b.period as Period) : "monthly",
    limit: Number(b.limitAmount),
    anchor: new Date(b.anchorDate),
    rollover: b.rollover,
    categoryIds: links.filter((l) => l.budgetId === b.id).map((l) => l.categoryId),
  }));
}

/**
 * Every budget in its current period.
 *
 * `offset` steps whole periods back or forward, per budget — they don't share
 * a calendar any more, so "last month" means something different to a weekly
 * envelope than to a yearly one.
 */
export async function listBudgets(offset = 0) {
  const today = new Date();
  const [envelopes, spending, categoryRows, base] = await Promise.all([
    loadEnvelopes(),
    loadSpending(),
    db.select().from(categories),
    getBaseCurrency(),
  ]);

  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  const items = envelopes.map((e) => {
    let bounds = periodBounds(e.period, e.anchor, today);
    if (offset !== 0) bounds = shiftPeriod(e.period, bounds, offset);

    const state = envelopeState(e, spending, today, bounds);
    const progress = offset === 0 ? periodProgress(bounds, today) : 1;

    return {
      ...state,
      rollover: e.rollover,
      progress,
      pacingOver: offset === 0 && isPacingOver(state, progress),
      monthlyEquivalent: monthlyEquivalent(e.limit, e.period),
      categories: e.categoryIds.map((id) => categoryName.get(id) ?? "?"),
      categoryIds: e.categoryIds,
    };
  });

  return {
    baseCurrency: base,
    offset,
    items: items.sort((a, b) => b.percent - a.percent),
    totalMonthly: Math.round(items.reduce((s, i) => s + i.monthlyEquivalent, 0) * 100) / 100,
    overCount: items.filter((i) => i.status === "over").length,
    availableCategories: categoryRows
      .filter((c) => c.kind === "expense")
      .map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function createBudget(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const period = String(formData.get("period") ?? "monthly");
  const limit = Number(formData.get("limitAmount"));
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const anchorRaw = String(formData.get("anchorDate") ?? "");
  const rollover = formData.get("rollover") === "on";

  if (!name) throw new Error("Give the budget a name.");
  if (!isPeriod(period)) throw new Error(`Unknown period: ${period}`);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("Enter a limit above zero.");
  if (categoryIds.length === 0) {
    // A budget watching nothing would sit at 0% forever and look healthy.
    throw new Error("Pick at least one category for the budget to watch.");
  }

  const anchor = anchorRaw ? new Date(anchorRaw) : new Date();

  const [created] = await db
    .insert(budgets)
    .values({
      name,
      period,
      limitAmount: String(limit),
      anchorDate: Number.isNaN(anchor.getTime()) ? new Date() : anchor,
      rollover,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .returning();

  await db
    .insert(budgetCategories)
    .values(categoryIds.map((categoryId) => ({ budgetId: created.id, categoryId })))
    .onConflictDoNothing();

  revalidatePath("/budgets");
  revalidatePath("/");
}

export async function updateBudget(formData: FormData) {
  const id = String(formData.get("id"));
  const limit = Number(formData.get("limitAmount"));
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("Enter a limit above zero.");

  await db
    .update(budgets)
    .set({ limitAmount: String(limit), updatedAt: new Date() })
    .where(eq(budgets.id, id));

  revalidatePath("/budgets");
}

/** Adds or removes a category from a budget without rebuilding the whole thing. */
export async function toggleBudgetCategory(formData: FormData) {
  const budgetId = String(formData.get("budgetId"));
  const categoryId = String(formData.get("categoryId"));
  const on = String(formData.get("on")) === "true";

  if (on) {
    await db.insert(budgetCategories).values({ budgetId, categoryId }).onConflictDoNothing();
  } else {
    await db
      .delete(budgetCategories)
      .where(and(eq(budgetCategories.budgetId, budgetId), eq(budgetCategories.categoryId, categoryId)));
  }

  revalidatePath("/budgets");
}

export async function setBudgetRollover(formData: FormData) {
  const id = String(formData.get("id"));
  const rollover = String(formData.get("rollover")) === "true";
  await db.update(budgets).set({ rollover, updatedAt: new Date() }).where(eq(budgets.id, id));
  revalidatePath("/budgets");
}

export async function deleteBudget(formData: FormData) {
  const id = String(formData.get("id"));
  await db.delete(budgets).where(eq(budgets.id, id));
  revalidatePath("/budgets");
  revalidatePath("/");
}

/** Spending in the current calendar month that no budget watches. */
export async function getUnbudgetedSpending() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [rows, links, categoryRows, base] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.type, "expense"), gte(transactions.date, start), lt(transactions.date, end))
      ),
    db.select().from(budgetCategories),
    db.select().from(categories),
    getBaseCurrency(),
  ]);

  const watched = new Set(links.map((l) => l.categoryId));
  const name = new Map(categoryRows.map((c) => [c.id, c.name]));

  let uncategorised = 0;
  const byCategory = new Map<string, number>();

  for (const t of rows) {
    const amount = Math.abs(Number(t.amount));
    if (!t.categoryId) uncategorised += amount;
    else if (!watched.has(t.categoryId)) {
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + amount);
    }
  }

  return {
    baseCurrency: base,
    uncategorised: Math.round(uncategorised * 100) / 100,
    categories: [...byCategory.entries()]
      .map(([id, amount]) => ({ id, name: name.get(id) ?? "?", amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount),
  };
}
