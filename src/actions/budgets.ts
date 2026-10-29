"use server";

import { db } from "@/db/client";
import { budgets, budgetCategories, categories, transactions, auditLog } from "@/db/schema";
import { and, eq, gte, lt, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getRates } from "./fx";
import { toBase } from "@/lib/fx";
import { ManualEntryError, manualAmount, manualDate } from "@/lib/money/manualEntry";
import { getBaseCurrency } from "./settings";
import { claimManualRequest, manualEntryResult, manualRequestId } from "./manualRequest";
import {
  envelopeState,
  periodBounds,
  shiftPeriod,
  periodProgress,
  isPacingOver,
  monthlyEquivalent,
  isPeriod,
  keptForBudgets,
  type Envelope,
  type Spend,
  type Period,
} from "@/lib/accounting/envelopes";

/** Expenses only. Income arriving does not "refund" a budget. */
async function loadSpending() {
  const [rows, rates, base] = await Promise.all([
    db.select().from(transactions).where(eq(transactions.type, "expense")), getRates(), getBaseCurrency(),
  ]);
  const spending: Spend[] = [];
  const missing: { date: Date; categoryId: string | null; currency: string }[] = [];
  for (const row of rows) {
    const amount = toBase(Number(row.amount), row.currency, rates, base);
    if (amount === null) missing.push({ date: row.date, categoryId: row.categoryId, currency: row.currency });
    else spending.push({ date: row.date, amount, categoryId: row.categoryId });
  }
  return { spending, missing };
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

    const state = envelopeState(e, spending.spending, today, bounds);
    const progress = offset === 0 ? periodProgress(bounds, today) : 1;

    return {
      ...state,
      unconverted: spending.missing.filter(row => row.categoryId && e.categoryIds.includes(row.categoryId) &&
        row.date < bounds.end && row.date >= (e.rollover ? periodBounds(e.period, e.anchor, e.anchor).start : bounds.start)).length,
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

/**
 * What the active budgets still have to spend in their current period, in
 * the base currency: money that is spoken for though not spent yet, which the
 * dashboard takes out of Free Cash (see `keptForBudgets`).
 */
export async function getKeptForBudgets() {
  const { total, unconverted } = await getBudgetsLeft();
  return { total, unconverted };
}

/** What budgets still have to spend; missing FX makes these estimates explicit. */
export async function getBudgetsLeft() {
  const today = new Date();
  const [envelopes, spending] = await Promise.all([loadEnvelopes(), loadSpending()]);
  const states = envelopes.map(e => envelopeState(e, spending.spending, today));
  const unconverted = spending.missing.filter(row => envelopes.some(e => {
    const bounds = periodBounds(e.period, e.anchor, today);
    const start = e.rollover ? periodBounds(e.period, e.anchor, e.anchor).start : bounds.start;
    return row.categoryId && e.categoryIds.includes(row.categoryId) && row.date >= start && row.date < bounds.end;
  })).length;
  return { total: keptForBudgets(states), count: states.filter(s => s.remaining > 0).length, unconverted };
}

export async function createBudget(formData: FormData) {
  const id = await manualRequestId(formData);
  const name = String(formData.get("name") ?? "").trim();
  const period = String(formData.get("period") ?? "monthly");
  const limit = manualAmount(String(formData.get("limitAmount") ?? ""));
  const categoryIds = [...new Set(formData.getAll("categoryIds").map(String).filter(Boolean))].sort();
  const anchorRaw = String(formData.get("anchorDate") ?? "");
  const rollover = formData.get("rollover") === "on";

  if (!name) throw new ManualEntryError("Give the budget a name.");
  if (!isPeriod(period)) throw new ManualEntryError("Choose a valid budget period.");
  if (categoryIds.length === 0) {
    // A budget watching nothing would sit at 0% forever and look healthy.
    throw new ManualEntryError("Pick at least one category for the budget to watch.");
  }

  const anchor = anchorRaw ? manualDate(anchorRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const details = JSON.stringify({name,period,limit,categoryIds,anchor:anchor?.toISOString() ?? null,rollover,notes});
  await db.transaction(async store => {
    if (!(await claimManualRequest(store,id,"budget:create",id,details))) {
      const [existing] = await store.select({id:budgets.id}).from(budgets).where(eq(budgets.id,id));
      if (!existing) throw new ManualEntryError("This entry has already been deleted.");
      return;
    }
    const validCategories = await store.select().from(categories).where(inArray(categories.id, categoryIds));
    if (validCategories.length !== categoryIds.length || validCategories.some(c => c.kind !== "expense")) {
      throw new ManualEntryError("Choose existing expense categories.");
    }
    const [created] = await store.insert(budgets).values({
      id, name, period, limitAmount: limit, anchorDate: anchor ?? new Date(), rollover, notes,
    }).returning();
    await store.insert(budgetCategories).values(categoryIds.map(categoryId => ({ budgetId: created.id, categoryId })));
    await store.insert(auditLog).values({entityType:"budget",entityId:id,action:"budget_created",details:JSON.stringify({name})});
  });

  revalidatePath("/budgets");
  revalidatePath("/");
}

export async function submitBudgetCreation(formData: FormData) {
  return manualEntryResult(() => createBudget(formData));
}

export async function updateBudget(formData: FormData) {
  const id = String(formData.get("id"));
  const limit = manualAmount(String(formData.get("limitAmount") ?? ""));

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

  await db.transaction(async store => {
    const [budget] = await store.select().from(budgets).where(eq(budgets.id, budgetId)).for("update");
    const [category] = await store.select().from(categories).where(eq(categories.id, categoryId));
    if (!budget || category?.kind !== "expense") throw new Error("Choose an existing budget and expense category.");
    if (on) await store.insert(budgetCategories).values({ budgetId, categoryId }).onConflictDoNothing();
    else {
      const links = await store.select().from(budgetCategories).where(eq(budgetCategories.budgetId, budgetId));
      if (links.length === 1 && links[0].categoryId === categoryId) throw new Error("Pick at least one category for the budget to watch.");
      await store.delete(budgetCategories).where(and(eq(budgetCategories.budgetId, budgetId), eq(budgetCategories.categoryId, categoryId)));
    }
  });

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

  const [rows, links, categoryRows, base, rates] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.type, "expense"), gte(transactions.date, start), lt(transactions.date, end))
      ),
    db.select().from(budgetCategories),
    db.select().from(categories),
    getBaseCurrency(),
    getRates(),
  ]);

  const watched = new Set(links.map((l) => l.categoryId));
  const name = new Map(categoryRows.map((c) => [c.id, c.name]));

  const unconverted: { amount: number; currency: string }[] = [];
  let uncategorised = 0;
  const byCategory = new Map<string, number>();

  for (const t of rows) {
    if (t.categoryId && watched.has(t.categoryId)) continue;
    const amount = toBase(Math.abs(Number(t.amount)), t.currency, rates, base);
    if (amount === null) { unconverted.push({ amount: Math.abs(Number(t.amount)), currency: t.currency }); continue; }
    if (!t.categoryId) uncategorised += amount;
    else if (!watched.has(t.categoryId)) {
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + amount);
    }
  }

  return {
    baseCurrency: base,
    unconverted,
    uncategorised: Math.round(uncategorised * 100) / 100,
    categories: [...byCategory.entries()]
      .map(([id, amount]) => ({ id, name: name.get(id) ?? "?", amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount),
  };
}
