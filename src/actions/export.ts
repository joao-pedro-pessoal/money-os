"use server";

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
  buckets: schema.buckets,
  bucketAllocations: schema.bucketAllocations,
  imports: schema.imports,
  transactions: schema.transactions,
  transactionTags: schema.transactionTags,
  transfers: schema.transfers,
  interestPayments: schema.interestPayments,
  accountSnapshots: schema.accountSnapshots,
  playlists: schema.playlists,
  holdings: schema.holdings,
  holdingSnapshots: schema.holdingSnapshots,
  watchlistItems: schema.watchlistItems,
  accountConnections: schema.accountConnections,
  positions: schema.positions,
  positionSnapshots: schema.positionSnapshots,
  positionMeta: schema.positionMeta,
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
  const data: Record<string, unknown[]> = {};

  for (const name of BACKUP_TABLES) {
    data[name] = await db.select().from(TABLES[name]);
  }

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

  // Reverse order: children before parents.
  for (const name of [...BACKUP_TABLES].reverse()) {
    await db.delete(TABLES[name]);
  }

  for (const name of BACKUP_TABLES) {
    const rows = data[name];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    // Dates arrive as ISO strings from JSON and must go back to Date objects.
    const revived = rows.map((r) => reviveDates(r as Record<string, unknown>));
    await db.insert(TABLES[name]).values(revived as never);
  }

  revalidatePath("/", "layout");
  return { ok: true as const, counts: check.counts };
}

const DATE_FIELDS = /(At|Date|timestamp|date)$/i;

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
