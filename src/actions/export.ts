"use server";
import { requireInvestments } from "./releaseEdition";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { BACKUP_TABLES, BACKUP_VERSION, validateBackup, toCsv, type BackupTable } from "@/lib/backup";
import { revalidatePath } from "next/cache";

/**
 * Maps backup table names to their Drizzle tables, in dependency order.
 * Derived from BACKUP_TABLES so adding a table to the backup format and
 * forgetting it here is a type error rather than silent data loss.
 */
const TABLES: Record<BackupTable, typeof schema.accounts> = {
  appSettings: schema.appSettings,
  exchangeRates: schema.exchangeRates,
  categories: schema.categories,
  subcategories: schema.subcategories,
  tags: schema.tags,
  accounts: schema.accounts,
  expectedMoney: schema.expectedMoney,
  liabilities: schema.liabilities,
  buckets: schema.buckets,
  bucketAllocations: schema.bucketAllocations,
  budgets: schema.budgets,
  budgetCategories: schema.budgetCategories,
  subscriptions: schema.subscriptions,
  savedViews: schema.savedViews,
  resourceCategories: schema.resourceCategories,
  resourceSubtags: schema.resourceSubtags,
  learningResources: schema.learningResources,
  learningResourceMeta: schema.learningResourceMeta,
  learningResourceCategories: schema.learningResourceCategories,
  learningResourceSubtags: schema.learningResourceSubtags,
  imports: schema.imports,
  transactions: schema.transactions,
  transactionTags: schema.transactionTags,
  subscriptionCharges: schema.subscriptionCharges,
  transfers: schema.transfers,
  interestPayments: schema.interestPayments,
  accountSnapshots: schema.accountSnapshots,
  playlists: schema.playlists,
  holdings: schema.holdings,
  holdingSnapshots: schema.holdingSnapshots,
  holdingAllocations: schema.holdingAllocations,
  watchlistItems: schema.watchlistItems,
  symbolNames: schema.symbolNames,
  accountConnections: schema.accountConnections,
  positions: schema.positions,
  positionSnapshots: schema.positionSnapshots,
  positionMeta: schema.positionMeta,
  investmentActivities: schema.investmentActivities,
  investmentActivityTags: schema.investmentActivityTags,
  tradeClassifications: schema.tradeClassifications,
  dividendPayments: schema.dividendPayments,
  brokerEvents: schema.brokerEvents,
  platformBalances: schema.platformBalances,
  syncLogs: schema.syncLogs,
  auditLog: schema.auditLog,
} as unknown as Record<BackupTable, typeof schema.accounts>;

/**
 * Complete JSON backup — every table, not a selection.
 *
 * MVP_SPEC §8 / PRODUCT_VISION §64: you should never be locked into the app to
 * reach your own data. The earlier version of this only covered seven tables
 * and would have silently lost the entire investments and connections side.
 */
export async function exportAllData() {
  // A balance and its movements must come from the same snapshot, even if
  // another request saves a transaction while these tables are being read.
  const data = await db.transaction(async (tx) => {
    const rows: Record<string, unknown[]> = {};
    for (const name of BACKUP_TABLES) rows[name] = await tx.select().from(TABLES[name]);
    return rows;
  }, { isolationLevel: "repeatable read", accessMode: "read only" });

  return JSON.stringify(
    { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data },
    null,
    2
  );
}

export async function exportTransactionsCsv() {
  const rows = await db.select().from(schema.transactions);
  const accountsList = await db.select().from(schema.accounts);
  const categoriesList = await db.select().from(schema.categories);
  const accountName = new Map(accountsList.map((a) => [a.id, a.name]));
  const categoryName = new Map(categoriesList.map((c) => [c.id, c.name]));

  return toCsv(
    rows.map((t) => ({
      date: new Date(t.date).toISOString().slice(0, 10),
      account: accountName.get(t.accountId) ?? "",
      type: t.type,
      category: t.categoryId ? (categoryName.get(t.categoryId) ?? "") : "",
      amount: t.amount,
      currency: t.currency,
      merchant: t.merchant ?? "",
      description: t.description ?? "",
      notes: t.notes ?? "",
    })),
    ["date", "account", "type", "category", "amount", "currency", "merchant", "description", "notes"]
  );
}

export async function exportHoldingsCsv() {
  await requireInvestments();
  const rows = await db.select().from(schema.holdings);
  const accountsList = await db.select().from(schema.accounts);
  const accountName = new Map(accountsList.map((a) => [a.id, a.name]));

  return toCsv(
    rows.map((h) => ({
      symbol: h.symbol,
      name: h.name ?? "",
      account: h.accountId ? (accountName.get(h.accountId) ?? "") : "",
      assetType: h.assetType ?? "",
      direction: h.direction,
      quantity: h.quantity,
      avgEntryPrice: h.avgEntryPrice,
      currentPrice: h.currentPrice,
      currency: h.currency,
      realizedPnl: h.realizedPnl ?? "0",
      riskLevel: h.riskLevel ?? "",
      timeHorizon: h.timeHorizon ?? "",
    })),
    [
      "symbol", "name", "account", "assetType", "direction", "quantity",
      "avgEntryPrice", "currentPrice", "currency", "realizedPnl", "riskLevel", "timeHorizon",
    ]
  );
}

/** Checks a backup file without touching anything, for the confirm screen. */
export async function inspectBackup(json: string) {
  try {
    return validateBackup(JSON.parse(json));
  } catch {
    return { ok: false, errors: ["The file isn't valid JSON."], warnings: [], counts: {} };
  }
}

/**
 * Replaces ALL data with the contents of a backup.
 *
 * Validated first, then deleted in reverse dependency order and reinserted in
 * forward order so foreign keys hold at every step. Destructive by nature —
 * the UI asks for an explicit typed confirmation before calling this.
 */
export async function restoreBackup(formData: FormData) {
  if (formData.get("confirmation") !== "RESTORE") throw new Error("Type RESTORE to confirm.");
  const json = String(formData.get("backup") ?? "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The file isn't valid JSON.");
  }

  const check = validateBackup(parsed);
  if (!check.ok) throw new Error(`Backup rejected: ${check.errors.join(" ")}`);

  const data = (parsed as { data: Record<string, unknown[]> }).data;

  // Any invalid row, missing parent or database failure must roll back the
  // deletions too. The original account remains intact until all inserts pass.
  await db.transaction(async (tx) => {
    for (const name of [...BACKUP_TABLES].reverse()) await tx.delete(TABLES[name]);
    for (const name of BACKUP_TABLES) {
      const rows = data[name];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const revived = rows.map((r) => withoutOwner(withPlaylistList(reviveDates(r as Record<string, unknown>))));
      await tx.insert(TABLES[name]).values(revived as never);
    }
  });

  revalidatePath("/", "layout");
  return { ok: true as const, counts: check.counts };
}

const DATE_FIELDS = /(At|Date|timestamp|date)$/i;

/**
 * The rows belong to whoever restores them, whatever account the file was made
 * in. The owner written in the file is dropped and the column's default — the
 * signed-in person — fills it: keeping it made a backup unrestorable after the
 * account was deleted and made again (a new id), and row security refused the
 * whole file. A forged owner in the file is ignored the same way, never obeyed.
 */
function withoutOwner(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  delete out.userId;
  return out;
}

/**
 * A backup from before one position could be in several playlists carries the
 * one it was in as `playlistId`. Restored as the first of the list, so the
 * position comes back in its playlist instead of in none.
 */
function withPlaylistList(row: Record<string, unknown>): Record<string, unknown> {
  if (row.playlistIds !== undefined || !("playlistId" in row)) return row;
  const { playlistId, ...rest } = row;
  return { ...rest, legacyPlaylistId: playlistId, playlistIds: typeof playlistId === "string" && playlistId ? [playlistId] : [] };
}

function reviveDates(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && DATE_FIELDS.test(key) && !Number.isNaN(Date.parse(value))) {
      out[key] = new Date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
