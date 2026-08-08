"use server";

import { db } from "@/db/client";
import {
  accountConnections,
  accounts,
  accountSnapshots,
  positions,
  positionSnapshots,
  platformBalances,
  positionMeta,
  playlists,
  syncLogs,
  auditLog,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createHyperliquidConnector } from "@/lib/connectors/hyperliquid";
import { createBybitConnector } from "@/lib/connectors/bybit";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { freshnessOf } from "@/lib/connectors/freshness";
import { refreshRates } from "./fx";
import type { Connector } from "@/lib/connectors/types";
import { NEW_ACCOUNT, PLATFORM_LABELS, bybitBaseUrl, BYBIT_REGIONS } from "@/lib/connectors/constants";

/**
 * Registry of available connectors. Adding a platform is a case here plus its
 * own folder in src/lib/connectors — the sync engine is untouched.
 *
 * `secret` is the already-decrypted credential, passed only to platforms that
 * need one.
 */
function connectorFor(
  platform: string,
  externalId: string,
  secret: string | null,
  region: string | null = null
): Connector {
  switch (platform) {
    case "hyperliquid":
      // Public read endpoint — no credential exists to leak.
      return createHyperliquidConnector();
    case "bybit":
      if (!secret) throw new Error("This Bybit connection has no stored API secret");
      // A key issued by bybit.eu is rejected by bybit.com and vice versa.
      return createBybitConnector(
        { apiKey: externalId, apiSecret: secret },
        undefined,
        bybitBaseUrl(region)
      );
    default:
      throw new Error(`No connector for platform "${platform}"`);
  }
}

/** Platforms whose credentials must be encrypted before being stored. */
const NEEDS_SECRET = new Set(["bybit"]);

/**
 * Whether secret storage is usable at all.
 *
 * Checked by the page so a missing key is explained up front, rather than
 * crashing on submit after the user has typed their credentials in.
 */
export async function canStoreSecrets(): Promise<boolean> {
  return Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 16);
}

function masterKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set. It's required to store API secrets — add a long random string to .env."
    );
  }
  return key;
}

export async function listConnections() {
  const [conns, allAccounts] = await Promise.all([
    db.select().from(accountConnections),
    db.select().from(accounts),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));

  return conns.map((c) => {
    // The encrypted secret must never reach a page prop; only a masked hint.
    const { encryptedSecret, ...safe } = c;
    return {
      ...safe,
      hasSecret: encryptedSecret !== null,
      externalIdMasked: maskSecret(c.externalId),
      accountName: accountName.get(c.accountId) ?? "(unknown account)",
      freshness: freshnessOf({ lastSyncAt: c.lastSyncAt, lastSyncStatus: c.lastSyncStatus }),
    };
  });
}

export async function listPositionsForConnection(connectionId: string) {
  const rows = await db.select().from(positions).where(eq(positions.connectionId, connectionId));
  return rows.map(parsePositionRow);
}

export async function listAllPositions() {
  const [rows, conns, allAccounts, meta, allPlaylists] = await Promise.all([
    db.select().from(positions),
    db.select().from(accountConnections),
    db.select().from(accounts),
    db.select().from(positionMeta),
    db.select().from(playlists),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const platformOf = new Map(conns.map((c) => [c.id, c.platform]));
  const playlistName = new Map(allPlaylists.map((p) => [p.id, p.name]));
  // Tags live in their own table keyed by connection + coin so a sync, which
  // fully replaces `positions`, never wipes them.
  const metaFor = new Map(meta.map((m) => [`${m.connectionId}:${m.coin}`, m]));

  return rows.map((r) => {
    const m = metaFor.get(`${r.connectionId}:${r.coin}`);
    return {
      ...parsePositionRow(r),
      accountName: accountName.get(r.accountId) ?? "—",
      platform: platformOf.get(r.connectionId) ?? "—",
      riskLevel: m?.riskLevel ?? null,
      expectedReturn: m?.expectedReturn ?? null,
      timeHorizon: m?.timeHorizon ?? null,
      liquidity: m?.liquidity ?? null,
      playlistId: m?.playlistId ?? null,
      playlistName: m?.playlistId ? playlistName.get(m.playlistId) ?? null : null,
      notes: m?.notes ?? null,
    };
  });
}

/**
 * Saves manual tags on an automatically-synced position.
 * Upserted on (connectionId, coin) so it survives every future sync.
 */
export async function setPositionTags(formData: FormData) {
  const connectionId = String(formData.get("connectionId"));
  const coin = String(formData.get("coin"));
  const value = (field: string) => {
    const v = String(formData.get(field) ?? "").trim();
    return v === "" ? null : v;
  };

  const values = {
    riskLevel: value("riskLevel"),
    expectedReturn: value("expectedReturn"),
    timeHorizon: value("timeHorizon"),
    liquidity: value("liquidity"),
    playlistId: value("playlistId"),
    notes: value("notes"),
    updatedAt: new Date(),
  };

  await db
    .insert(positionMeta)
    .values({ connectionId, coin, ...values })
    .onConflictDoUpdate({
      target: [positionMeta.connectionId, positionMeta.coin],
      set: values,
    });

  revalidatePath("/positions");
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

export async function listBalances() {
  const [rows, conns, allAccounts] = await Promise.all([
    db.select().from(platformBalances),
    db.select().from(accountConnections),
    db.select().from(accounts),
  ]);
  const accountName = new Map(allAccounts.map((a) => [a.id, a.name]));
  const accountOf = new Map(conns.map((c) => [c.id, c.accountId]));

  return rows.map((b) => ({
    ...b,
    total: Number(b.total),
    hold: b.hold === null ? 0 : Number(b.hold),
    price: b.price === null ? null : Number(b.price),
    usdValue: b.usdValue === null ? null : Number(b.usdValue),
    available: Number(b.total) - (b.hold === null ? 0 : Number(b.hold)),
    accountName: accountName.get(accountOf.get(b.connectionId) ?? "") ?? "—",
  }));
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
  let accountId = String(formData.get("accountId") ?? "").trim();
  const platform = String(formData.get("platform") ?? "hyperliquid").trim();
  const externalId = String(formData.get("externalId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || null;

  if (!accountId) throw new Error("Pick the account this connection feeds");

  const apiSecret = String(formData.get("apiSecret") ?? "").trim();
  const rawRegion = String(formData.get("region") ?? "").trim();
  // Only a known region is ever stored, so no arbitrary host can be reached.
  const region =
    platform === "bybit"
      ? (BYBIT_REGIONS.find((r) => r.value === rawRegion)?.value ?? BYBIT_REGIONS[0].value)
      : null;
  if (NEEDS_SECRET.has(platform) && !apiSecret) {
    throw new Error("This platform needs an API secret as well as a key");
  }

  const connector = connectorFor(platform, externalId, apiSecret || null, region);
  const check = connector.validateIdentifier(externalId);
  if (!check.ok) throw new Error(check.reason);

  // Encrypted before it goes anywhere near the database.
  const encryptedSecret = apiSecret ? encryptSecret(apiSecret, masterKey()) : null;

  // A platform you're connecting for the first time usually has no Account
  // yet, so offer to create it here rather than forcing a detour to /accounts.
  // Balance starts at 0 and is overwritten by the first sync with real equity.
  if (accountId === NEW_ACCOUNT) {
    const institution = PLATFORM_LABELS[platform] ?? platform;
    const [created] = await db
      .insert(accounts)
      .values({
        institution,
        name: label ?? institution,
        accountType: "exchange",
        currency: "USD", // Hyperliquid settles in USDC
        balance: "0",
      })
      .returning();
    accountId = created.id;
  }

  const [c] = await db
    .insert(accountConnections)
    .values({ accountId, platform, region, externalId, label, encryptedSecret })
    .returning();

  await db.insert(auditLog).values({
    entityType: "connection",
    entityId: c.id,
    action: "connection_created",
    details: JSON.stringify({ platform, accountId }),
  });

  revalidatePath("/connections");
  revalidatePath("/accounts");
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
  // A synced account is often in another currency, and a balance with no
  // exchange rate is excluded from every total. Refreshing first means the
  // first manual sync of a new connection lands in Net Worth straight away.
  await refreshRates();
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
    const secret = conn.encryptedSecret ? decryptSecret(conn.encryptedSecret, masterKey()) : null;
    const connector = connectorFor(conn.platform, conn.externalId, secret, conn.region);
    const state = await connector.getAccountState(conn.externalId);

    // 1. Account balance = perps equity ONLY.
    //    Equity already contains the unrealized P&L of open positions, so
    //    positions are never added to it. Spot balances are a separate pool
    //    and are counted in Portfolio Value instead (see
    //    getPortfolioContribution) — deliberately NOT here, or the same money
    //    would land in Net Worth twice.
    const total = Math.round((state.equity + Number.EPSILON) * 100) / 100;

    await db
      .update(accounts)
      .set({
        balance: String(total),
        lastManualUpdate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, conn.accountId));

    await db.insert(accountSnapshots).values({
      accountId: conn.accountId,
      balance: String(total),
    });

    // 2. Spot balances, fully replaced (a spent token stops being returned).
    await db.delete(platformBalances).where(eq(platformBalances.connectionId, conn.id));
    if (state.balances.length > 0) {
      await db.insert(platformBalances).values(
        state.balances.map((b) => ({
          connectionId: conn.id,
          coin: b.coin,
          total: String(b.total),
          hold: String(b.hold),
          price: b.price === null ? null : String(b.price),
          usdValue: b.usdValue === null ? null : String(b.usdValue),
          countsInPortfolio: state.balancesAreSeparatePool,
          updatedAt: new Date(),
        }))
      );
    }

    // 3. Replace the position set. Closed positions simply stop being returned
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
        lastEquity: String(state.equity),
        lastSpotValue: String(state.spotValue),
        lastWithdrawable: state.withdrawable === null ? null : String(state.withdrawable),
        lastMarginUsed: state.totalMarginUsed === null ? null : String(state.totalMarginUsed),
        updatedAt: new Date(),
      })
      .where(eq(accountConnections.id, conn.id));

    await db.insert(syncLogs).values({
      connectionId: conn.id,
      startedAt,
      finishedAt: new Date(),
      status: "ok",
      positionsFound: String(state.positions.length),
      equity: String(total),
      trigger,
    });

    return {
      ok: true as const,
      equity: state.equity,
      spotValue: state.spotValue,
      total,
      positions: state.positions.length,
    };
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

/** Fire-and-forget sync of every connection, for the AutoSync client component. */
export async function autoSyncAction() {
  // Refresh FX first so converted totals use today's rate, not yesterday's.
  await refreshRates();
  await syncAllConnections("scheduled");
  revalidatePath("/connections");
  revalidatePath("/positions");
  revalidatePath("/");
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

/**
 * What each connected account actually holds on its platform.
 *
 * The stored `balance` is perps equity only — spot lives in Portfolio Value —
 * so an account whose money is all in USDC reads as 0, which looks broken even
 * though Net Worth is right. This gives the display layer the real figure
 * without changing what anything counts.
 */
export async function getAccountPlatformTotals() {
  const [conns, balances, pos] = await Promise.all([
    db.select().from(accountConnections),
    db.select().from(platformBalances),
    db.select().from(positions),
  ]);

  const byAccount = new Map<
    string,
    { equity: number; spot: number; total: number; unrealizedPnl: number; positions: number }
  >();

  for (const c of conns) {
    const spot = balances
      .filter((b) => b.connectionId === c.id)
      .reduce((s, b) => s + (b.usdValue === null ? 0 : Number(b.usdValue)), 0);

    const mine = pos.filter((p) => p.connectionId === c.id);
    const unrealizedPnl = mine.reduce(
      (s, p) => s + (p.unrealizedPnl === null ? 0 : Number(p.unrealizedPnl)),
      0
    );

    const equity = Number(c.lastEquity ?? 0);
    const existing = byAccount.get(c.accountId);

    byAccount.set(c.accountId, {
      equity: round2((existing?.equity ?? 0) + equity),
      spot: round2((existing?.spot ?? 0) + spot),
      total: round2((existing?.total ?? 0) + equity + spot),
      unrealizedPnl: round2((existing?.unrealizedPnl ?? 0) + unrealizedPnl),
      positions: (existing?.positions ?? 0) + mine.length,
    });
  }

  return byAccount;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
