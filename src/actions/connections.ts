"use server";

import { db } from "@/db/client";
import {
  accountConnections,
  accounts,
  accountSnapshots,
  positions,
  positionSnapshots,
  syncLogs,
  auditLog,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createHyperliquidConnector } from "@/lib/connectors/hyperliquid";
import { freshnessOf } from "@/lib/connectors/freshness";
import type { Connector } from "@/lib/connectors/types";

/** Registry of available connectors. Bybit/IBKR slot in here unchanged. */
function connectorFor(platform: string): Connector {
  switch (platform) {
    case "hyperliquid":
      return createHyperliquidConnector();
    default:
      throw new Error(`No connector for platform "${platform}"`);
  }
}

export async function listConnections() {
  const [conns, allAccounts] = await Promise.all([
    db.select().from(accountConnections),
    db.select().from(accounts),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));

  return conns.map((c) => ({
    ...c,
    accountName: accountName.get(c.accountId) ?? "(unknown account)",
    freshness: freshnessOf({ lastSyncAt: c.lastSyncAt, lastSyncStatus: c.lastSyncStatus }),
  }));
}

export async function listPositionsForConnection(connectionId: string) {
  const rows = await db.select().from(positions).where(eq(positions.connectionId, connectionId));
  return rows.map(parsePositionRow);
}

export async function listAllPositions() {
  const [rows, conns, allAccounts] = await Promise.all([
    db.select().from(positions),
    db.select().from(accountConnections),
    db.select().from(accounts),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const platformOf = new Map(conns.map((c) => [c.id, c.platform]));

  return rows.map((r) => ({
    ...parsePositionRow(r),
    accountName: accountName.get(r.accountId) ?? "—",
    platform: platformOf.get(r.connectionId) ?? "—",
  }));
}

function parsePositionRow(r: typeof positions.$inferSelect) {
  return {
    ...r,
    size: Number(r.size),
    entryPrice: r.entryPrice === null ? null : Number(r.entryPrice),
    markPrice: r.markPrice === null ? null : Number(r.markPrice),
    positionValue: r.positionValue === null ? null : Number(r.positionValue),
    unrealizedPnl: r.unrealizedPnl === null ? null : Number(r.unrealizedPnl),
    returnOnEquity: r.returnOnEquity === null ? null : Number(r.returnOnEquity),
    leverage: r.leverage === null ? null : Number(r.leverage),
    liquidationPrice: r.liquidationPrice === null ? null : Number(r.liquidationPrice),
    marginUsed: r.marginUsed === null ? null : Number(r.marginUsed),
    cumFunding: r.cumFunding === null ? null : Number(r.cumFunding),
  };
}

export async function getSyncLogs(connectionId: string, limit = 10) {
  return db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.connectionId, connectionId))
    .orderBy(desc(syncLogs.startedAt))
    .limit(limit);
}

export async function createConnection(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "").trim();
  const platform = String(formData.get("platform") ?? "hyperliquid").trim();
  const externalId = String(formData.get("externalId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || null;

  if (!accountId) throw new Error("Pick the account this connection feeds");

  const connector = connectorFor(platform);
  const check = connector.validateIdentifier(externalId);
  if (!check.ok) throw new Error(check.reason);

  const [c] = await db
    .insert(accountConnections)
    .values({ accountId, platform, externalId, label })
    .returning();

  await db.insert(auditLog).values({
    entityType: "connection",
    entityId: c.id,
    action: "connection_created",
    details: JSON.stringify({ platform, accountId }),
  });

  revalidatePath("/connections");
}

export async function deleteConnection(formData: FormData) {
  const id = String(formData.get("id"));
  await db.insert(auditLog).values({
    entityType: "connection",
    entityId: id,
    action: "connection_deleted",
  });
  // Positions and logs cascade — they're derived data, not user input.
  await db.delete(accountConnections).where(eq(accountConnections.id, id));
  revalidatePath("/connections");
  revalidatePath("/positions");
}

export async function syncConnectionAction(formData: FormData) {
  const id = String(formData.get("id"));
  await syncConnection(id, "manual");
  revalidatePath("/connections");
  revalidatePath("/positions");
  revalidatePath("/");
}

/**
 * Pulls the current state from the platform and writes it locally.
 *
 * ACCOUNTING RULE (PRODUCT_VISION §9): `equity` already contains the unrealized
 * P&L of every open position, so it is written to `accounts.balance` and the
 * positions are stored purely for display. Nothing here adds position value on
 * top of the balance — doing so would count the same money twice.
 *
 * Never throws: a failure is recorded on the connection and in the sync log so
 * the UI can show ERROR rather than silently presenting stale data as live.
 */
export async function syncConnection(connectionId: string, trigger: "manual" | "scheduled" = "manual") {
  const [conn] = await db
    .select()
    .from(accountConnections)
    .where(eq(accountConnections.id, connectionId));

  if (!conn) throw new Error("Connection not found");

  const startedAt = new Date();

  try {
    const connector = connectorFor(conn.platform);
    const state = await connector.getAccountState(conn.externalId);

    // 1. Equity becomes the account balance (source of truth is the exchange).
    await db
      .update(accounts)
      .set({
        balance: String(state.equity),
        lastManualUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, conn.accountId));

    await db.insert(accountSnapshots).values({
      accountId: conn.accountId,
      balance: String(state.equity),
    });

    // 2. Replace the position set. Closed positions simply stop being returned
    //    by the API, so a full replace is what makes them disappear here too.
    await db.delete(positions).where(eq(positions.connectionId, conn.id));

    if (state.positions.length > 0) {
      await db.insert(positions).values(
        state.positions.map((p) => ({
          connectionId: conn.id,
          accountId: conn.accountId,
          coin: p.coin,
          side: p.side,
          size: String(p.size),
          entryPrice: p.entryPrice === null ? null : String(p.entryPrice),
          markPrice: p.markPrice === null ? null : String(p.markPrice),
          positionValue: p.positionValue === null ? null : String(p.positionValue),
          unrealizedPnl: p.unrealizedPnl === null ? null : String(p.unrealizedPnl),
          returnOnEquity: p.returnOnEquity === null ? null : String(p.returnOnEquity),
          leverage: p.leverage === null ? null : String(p.leverage),
          leverageType: p.leverageType,
          liquidationPrice: p.liquidationPrice === null ? null : String(p.liquidationPrice),
          marginUsed: p.marginUsed === null ? null : String(p.marginUsed),
          cumFunding: p.cumFunding === null ? null : String(p.cumFunding),
          updatedAt: new Date(),
        }))
      );

      await db.insert(positionSnapshots).values(
        state.positions.map((p) => ({
          connectionId: conn.id,
          coin: p.coin,
          markPrice: p.markPrice === null ? null : String(p.markPrice),
          positionValue: p.positionValue === null ? null : String(p.positionValue),
          unrealizedPnl: p.unrealizedPnl === null ? null : String(p.unrealizedPnl),
        }))
      );
    }

    await db
      .update(accountConnections)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(accountConnections.id, conn.id));

    await db.insert(syncLogs).values({
      connectionId: conn.id,
      startedAt,
      finishedAt: new Date(),
      status: "ok",
      positionsFound: String(state.positions.length),
      equity: String(state.equity),
      trigger,
    });

    return { ok: true as const, equity: state.equity, positions: state.positions.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(accountConnections)
      .set({ lastSyncStatus: "error", lastSyncError: message, updatedAt: new Date() })
      .where(eq(accountConnections.id, conn.id));

    await db.insert(syncLogs).values({
      connectionId: conn.id,
      startedAt,
      finishedAt: new Date(),
      status: "error",
      message,
      trigger,
    });

    return { ok: false as const, error: message };
  }
}

/** Syncs every active connection. Used by the schedulable route. */
export async function syncAllConnections(trigger: "manual" | "scheduled" = "scheduled") {
  const conns = await db.select().from(accountConnections).where(eq(accountConnections.active, true));
  const results = [];
  for (const c of conns) {
    results.push({ id: c.id, platform: c.platform, ...(await syncConnection(c.id, trigger)) });
  }
  return results;
}
