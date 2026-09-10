"use server";

import { cookies } from "next/headers";
import { expectedSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  accounts,
  auditLog,
  imports,
  investmentActivities,
  investmentActivityTags,
  playlists,
  tradeClassifications,
  tags,
} from "@/db/schema";
import {
  calculateInvestmentLedger,
  investmentActivityFingerprint,
  type InvestmentActivityInput,
} from "@/lib/investment-activity";
import { parseTradeClassification } from "@/lib/trading/classification";
import {
  cumulativePnl,
  bySymbol,
  byDirection,
  byMonth,
  byHour,
  averageSize,
  holdingPeriods,
  holdingSummary,
  isInstrumentTrade,
} from "@/lib/trading/stats";
import { toBase } from "@/lib/fx";
import { tradeFilterOptions, type TradeHistoryRow } from "@/lib/trading/filter";
import { getPortfolioItems } from "./dashboard";
import { deriveRealisedPnl } from "@/lib/trading/realised";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";

export async function getExistingInvestmentFingerprints(accountId: string): Promise<string[]> {
  const rows = await db
    .select({ fingerprint: investmentActivities.fingerprint })
    .from(investmentActivities)
    .where(eq(investmentActivities.accountId, accountId));
  return rows.map((row) => row.fingerprint);
}

export async function commitInvestmentActivityImport(input: {
  accountId: string;
  fileName: string;
  fileHash: string;
  rowsInFile: number;
  rows: InvestmentActivityInput[];
}) {
  const [account] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, input.accountId));
  if (!account) throw new Error("Account not found");
  if (!input.fileName || input.rows.length === 0) throw new Error("There is nothing to import");

  const sameHash = input.fileHash
    ? await db
        .select({ id: imports.id, columnMapping: imports.columnMapping })
        .from(imports)
        .where(and(eq(imports.accountId, input.accountId), eq(imports.fileHash, input.fileHash)))
    : [];
  if (
    sameHash.some((row) => {
      try {
        return JSON.parse(row.columnMapping ?? "{}").scope === "investment-activity";
      } catch {
        return false;
      }
    })
  ) {
    throw new Error("This exact file has already been imported into this account");
  }

  const result = await db.transaction(async (tx) => {
    const [importRow] = await tx
      .insert(imports)
      .values({
        accountId: input.accountId,
        fileName: input.fileName,
        columnMapping: JSON.stringify({ scope: "investment-activity", version: 1 }),
        rowsImported: "0",
        rowsDuplicated: "0",
        rowsIgnored: String(Math.max(0, input.rowsInFile - input.rows.length)),
        fileHash: input.fileHash || null,
        rowsInFile: String(input.rowsInFile),
      })
      .returning();

    const values = input.rows.map((row) => ({
      accountId: input.accountId,
      importId: importRow.id,
      date: new Date(`${row.date}T12:00:00Z`),
      type: row.type,
      symbol: row.symbol || null,
      quantity: row.quantity === null ? null : String(row.quantity),
      price: row.price === null ? null : String(row.price),
      amount: String(row.amount),
      fees: row.fees === null ? null : String(row.fees),
      currency: row.currency,
      description: row.description || null,
      externalId: row.externalId || null,
      fingerprint: investmentActivityFingerprint(row),
    }));

    const created = await tx
      .insert(investmentActivities)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: investmentActivities.id });
    const duplicates = values.length - created.length;

    await tx
      .update(imports)
      .set({ rowsImported: String(created.length), rowsDuplicated: String(duplicates) })
      .where(eq(imports.id, importRow.id));
    await tx.insert(auditLog).values({
      entityType: "investment_import",
      entityId: importRow.id,
      action: "investment_activity_imported",
      details: JSON.stringify({ fileName: input.fileName, created: created.length, duplicates }),
    });
    return { importId: importRow.id, created: created.length, duplicates };
  });

  revalidatePath("/investments/analysis");
  revalidatePath("/investments/history");
  revalidatePath("/investments");
  revalidatePath("/investments", "layout");
  revalidatePath("/investments/analysis");
  revalidatePath("/analytics");
  revalidatePath("/");
  return result;
}

export async function listInvestmentActivity() {
  const [activity, accountRows, importRows] = await Promise.all([
    db.select().from(investmentActivities).orderBy(desc(investmentActivities.date), desc(investmentActivities.createdAt)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts),
    db.select().from(imports).orderBy(desc(imports.createdAt)),
  ]);
  const accountNames = new Map(accountRows.map((account) => [account.id, account.name]));
  const investmentImportIds = new Set(
    importRows.flatMap((row) => {
      try {
        return JSON.parse(row.columnMapping ?? "{}").scope === "investment-activity" ? [row.id] : [];
      } catch {
        return [];
      }
    })
  );
  const ledgerGroups = new Map<string, Parameters<typeof calculateInvestmentLedger>[0]>();
  for (const row of activity) {
    const key = `${row.accountId}|${row.currency}`;
    if (!ledgerGroups.has(key)) ledgerGroups.set(key, []);
    ledgerGroups.get(key)!.push({
      accountId: row.accountId,
      date: new Date(row.date).toISOString().slice(0, 10),
      type: row.type as InvestmentActivityInput["type"],
      symbol: row.symbol ?? "",
      quantity: row.quantity === null ? null : Number(row.quantity),
      price: row.price === null ? null : Number(row.price),
      amount: Number(row.amount),
      fees: row.fees === null ? null : Number(row.fees),
      currency: row.currency,
      description: row.description ?? "",
      externalId: row.externalId ?? "",
      fingerprint: row.fingerprint,
    });
  }
  const realizedByFingerprint = new Map<string, number>();
  const realizedByCurrency = new Map<string, number>();
  for (const rows of ledgerGroups.values()) {
    const ledger = calculateInvestmentLedger(rows);
    for (const [fingerprint, realized] of ledger.realizedByFingerprint) {
      realizedByFingerprint.set(fingerprint, realized);
    }
    const currency = rows[0]?.currency;
    if (currency) realizedByCurrency.set(currency, (realizedByCurrency.get(currency) ?? 0) + ledger.realizedTotal);
  }

  return {
    activity: activity.map((row) => ({
      ...row,
      accountName: accountNames.get(row.accountId) ?? "—",
      realizedPnl: realizedByFingerprint.get(row.fingerprint) ?? null,
    })),
    realizedByCurrency: [...realizedByCurrency].map(([currency, value]) => ({ currency, value })),
    imports: importRows
      .filter((row) => investmentImportIds.has(row.id))
      .map((row) => ({
        ...row,
        accountName: row.accountId ? accountNames.get(row.accountId) ?? "—" : "—",
        rowsImported: Number(row.rowsImported),
        rowsDuplicated: Number(row.rowsDuplicated),
      })),
  };
}

export async function undoInvestmentActivityImport(formData: FormData) {
  const importId = String(formData.get("importId") ?? "");
  const [row] = await db.select().from(imports).where(eq(imports.id, importId));
  if (!row) throw new Error("Import not found");
  let isInvestmentImport = false;
  try {
    isInvestmentImport = JSON.parse(row.columnMapping ?? "{}").scope === "investment-activity";
  } catch {
    // An unreadable scope is not safe to delete through this action.
  }
  if (!isInvestmentImport) throw new Error("This is not an investment-history import");

  const removed = await db
    .select({ id: investmentActivities.id })
    .from(investmentActivities)
    .where(eq(investmentActivities.importId, importId));
  await db.delete(imports).where(eq(imports.id, importId));
  await db.insert(auditLog).values({
    entityType: "investment_import",
    entityId: importId,
    action: "investment_activity_import_undone",
    details: JSON.stringify({ removed: removed.length }),
  });
  revalidatePath("/investments/analysis");
  revalidatePath("/investments/history");
  revalidatePath("/investments");
  revalidatePath("/investments", "layout");
  revalidatePath("/investments/analysis");
  revalidatePath("/analytics");
  revalidatePath("/");
}

/**
 * The trade history, analysed.
 *
 * Everything is converted to the base currency **before** any of it is added:
 * the history holds Hyperliquid fills in dollars next to Trading 212 rows in
 * euros, and summing those raw produces a number in no currency at all. That
 * is the bug this codebase has fixed nine times, and a page of charts is the
 * easiest place in the app to hide the tenth.
 *
 * Rates are today's. A June trade converted at an August rate is approximate,
 * and `approximate` says so rather than letting the charts imply a precision
 * they do not have — the same treatment the net-worth series gives backfilled
 * points.
 */
export async function getTradeAnalysis() {
  const [rows, accountRows, tagLinks, tagRows, metaRows, playlistRows, portfolio, rates, base] =
    await Promise.all([
    db
      .select()
      .from(investmentActivities)
      .orderBy(desc(investmentActivities.date)),
    db.select().from(accounts),
    db.select().from(investmentActivityTags),
    db.select().from(tags),
    db.select().from(tradeClassifications),
    db.select().from(playlists),
    getPortfolioItems(),
    getRates(),
    getBaseCurrency(),
  ]);

  const accountNames = new Map(accountRows.map((account) => [account.id, account.name]));
  const classificationByActivity = new Map(metaRows.map(m => [m.activityId, m]));

  /**
   * Your labels, per event.
   *
   * An event with none gets an empty array rather than a null: most rows are
   * never labelled, and "unlabelled" is not itself a label. A link pointing at
   * a tag that no longer exists is skipped — the cascade should have removed
   * it, and reading a dangling one would put `undefined` on a row.
   */
  const tagName = new Map(tagRows.map((t) => [t.id, t.name]));
  const tagsByActivity = new Map<string, string[]>();
  for (const link of tagLinks) {
    const name = tagName.get(link.tagId);
    if (name === undefined) continue;
    tagsByActivity.set(link.activityId, [...(tagsByActivity.get(link.activityId) ?? []), name]);
  }

  const playlistName = new Map(playlistRows.map((p) => [p.id, p.name]));

  const classificationOf = (activityId: string) => {
    const meta = classificationByActivity.get(activityId);
    if (!meta) return null;
    return { ...meta, assetTypeAuto: false,
      apr: meta.apr === null ? null : Number(meta.apr),
      playlistName: meta.playlistId ? playlistName.get(meta.playlistId) ?? null : null };
  };

  let unconvertible = 0;
  /**
   * Carries the account and the original currency alongside the figures.
   *
   * The statistics do not need either, but the filters do — and the rows have
   * to be the *same* rows the charts are computed from, or filtering would
   * narrow one and not the other.
   */
  const converted: TradeHistoryRow[] = [];

  for (const row of rows) {
    const amount = toBase(Number(row.amount), row.currency, rates, base);
    // No rate means leave it out and say so, never count it as zero.
    if (amount === null) {
      unconvertible += 1;
      continue;
    }
    const fees = row.fees === null ? null : toBase(Number(row.fees), row.currency, rates, base);
    const realized =
      row.realizedPnl === null ? null : toBase(Number(row.realizedPnl), row.currency, rates, base);

    converted.push({
      date: new Date(row.date).toISOString(),
      type: row.type,
      symbol: row.symbol,
      quantity: row.quantity === null ? null : Number(row.quantity),
      amount,
      fees,
      realizedPnl: realized,
      description: row.description,
      accountName: row.accountId ? accountNames.get(row.accountId) ?? "—" : "—",
      currency: row.currency,
      id: row.id,
      accountId: row.accountId,
      connectionId: row.connectionId,
      brokerPositionId: row.brokerPositionId,
      brokerOpenedAt: row.brokerOpenedAt?.toISOString() ?? null,
      brokerPositionSummary: row.brokerPositionSummary,
      tags: (tagsByActivity.get(row.id) ?? []).sort((a, b) => a.localeCompare(b)),
      classification: classificationOf(row.id),
    });
  }

  /**
   * A result worked out here where the venue publishes none.
   *
   * Only Hyperliquid states a realised P&L per fill — 46 rows of 96 on this
   * account. Interactive Brokers states none on any of its 22, so the page
   * reported "none of which has closed a position yet" about an account that
   * had bought 3.465 FEMY and sold all of it a fortnight later. The venue's
   * figure still wins wherever there is one; see `lib/trading/realised.ts`.
   */
  const accountsForPnl = new Map<string, TradeHistoryRow[]>();
  for (const row of converted) {
    const key = JSON.stringify([row.accountId, row.connectionId, row.currency]);
    accountsForPnl.set(key, [...(accountsForPnl.get(key) ?? []), row]);
  }
  const enriched = [...accountsForPnl.values()].flatMap(deriveRealisedPnl).sort((a, b) => b.date.localeCompare(a.date));

  const periods = holdingPeriods(enriched);
  const trades = enriched.filter(isInstrumentTrade);

  return {
    baseCurrency: base,
    /** Rows dropped because nothing could convert them. Never silently zero. */
    unconvertible,
    /** True while any row needed a rate that isn't the rate of its own day. */
    approximate: rows.some((r) => r.currency !== base),
    tradeCount: trades.length,
    closedCount: trades.filter((r) => r.realizedPnl !== null).length,
    pnl: cumulativePnl(enriched),
    symbols: bySymbol(enriched),
    directions: byDirection(enriched),
    months: byMonth(enriched),
    hours: byHour(enriched),
    averageSize: averageSize(enriched),
    holding: holdingSummary(periods),
    periods: periods.slice(0, 25),
    /**
     * The converted rows themselves, so the screen can narrow them and call
     * the same statistics again over what is left.
     *
     * Sent rather than a second set of pre-filtered figures: there is one
     * implementation of "win rate", and filtering must not create a second.
     */
    rows: enriched,
    options: tradeFilterOptions(enriched),
    /**
     * What is still held, for pairing a realised result with an unrealised one.
     *
     * Handed over rather than paired here, because the pairing has to follow
     * the filter — it happens where the filtering happens, so narrowing to one
     * instrument narrows both halves of its result together.
     *
     * `costUnknown` becomes a null gain rather than a zero: a synced exchange
     * balance states no cost, and zero would claim it is exactly break-even.
     */
    held: portfolio.items
      .filter((i) => i.symbol)
      .map((i) => ({
        symbol: i.symbol as string,
        unrealised: i.costUnknown ? null : i.pnl,
        value: i.value,
      })),
  };
}


/** Every tag in the vocabulary, for offering what already exists. */
export async function listTagNames(): Promise<string[]> {
  const rows = await db.select().from(tags);
  return rows.map((t) => t.name).sort((a, b) => a.localeCompare(b));
}

/** Replaces tags on one trade event, keeping labels separate per fill. */
export async function setInvestmentActivityTags(formData: FormData) {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== await expectedSessionValue()) throw new Error("Sign in again.");
  const activityId = String(formData.get("activityId") ?? "").trim();
  if (!activityId || activityId.length > 200) throw new Error("Invalid trade.");
  const names = [...new Set(String(formData.get("tags") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (names.length > 30 || names.some((name) => name.length > 80)) throw new Error("Use at most 30 tags, each under 80 characters.");
  await db.transaction(async (tx) => {
    const [activity] = await tx.select({ id: investmentActivities.id }).from(investmentActivities).where(eq(investmentActivities.id, activityId)).for("update");
    if (!activity) throw new Error("Trade no longer exists.");
    await tx.delete(investmentActivityTags).where(eq(investmentActivityTags.activityId, activityId));
    for (const name of names) {
      const [tag] = await tx.insert(tags).values({ name }).onConflictDoUpdate({ target: tags.name, set: { name } }).returning();
      if (tag) await tx.insert(investmentActivityTags).values({ activityId, tagId: tag.id }).onConflictDoNothing();
    }
  });
  revalidatePath("/investments/analysis");
  revalidatePath("/investments/history");
}

export async function setTradeClassification(formData: FormData) {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== await expectedSessionValue()) throw new Error("Sign in again.");
  const activityId = String(formData.get("activityId") ?? "");
  const input = Object.fromEntries([...formData.entries()].map(([key, value]) => [key, String(value)]));
  const values = parseTradeClassification(input);
  await db.transaction(async tx => {
    const [row] = await tx.select({ id: investmentActivities.id }).from(investmentActivities).where(eq(investmentActivities.id, activityId)).for("update");
    if (!row) throw new Error("Trade no longer exists.");
    if (values.playlistId) {
      const [playlist] = await tx.select({ id: playlists.id }).from(playlists).where(eq(playlists.id, values.playlistId));
      if (!playlist) throw new Error("Playlist no longer exists.");
    }
    await tx.insert(tradeClassifications).values({ activityId, ...values }).onConflictDoUpdate({ target: tradeClassifications.activityId, set: { ...values, updatedAt: new Date() } });
  });
  revalidatePath("/investments", "layout");
  revalidatePath("/investments/analysis");
  revalidatePath("/investments/history");
}
