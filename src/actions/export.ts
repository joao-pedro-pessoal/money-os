"use server";
import { requireServerSession } from "./requestSession";
import { requireInvestments } from "./releaseEdition";
import { withWork } from "./workGate";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { BACKUP_TABLES, BACKUP_VERSION, toCsv } from "@/lib/backup";

import { TABLES } from "./backupTables";
/**
 * Complete JSON backup — every table, not a selection.
 *
 * MVP_SPEC §8 / PRODUCT_VISION §64: you should never be locked into the app to
 * reach your own data. The earlier version of this only covered seven tables
 * and would have silently lost the entire investments and connections side.
 */
export async function exportAllData() {
  await requireServerSession();
  return withWork("export", async () => {
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
  });
}

export async function exportTransactionsCsv() {
  await requireServerSession();
  return withWork("export", async () => {
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
  });
}

export async function exportHoldingsCsv() {
  await requireInvestments();
  return withWork("export", async () => {
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
  });
}
