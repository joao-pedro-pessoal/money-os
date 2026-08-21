"use server";

import { db } from "@/db/client";
import {
  playlists,
  holdings,
  watchlistItems,
  auditLog,
  positions,
  positionMeta,
  accountConnections,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { marketValue, costBasis, unrealizedPnL } from "@/lib/portfolio";
import { capitalAtRisk } from "@/lib/connectors/margin";
import { toBase } from "@/lib/fx";
import { getRates } from "./fx";
import { getBaseCurrency } from "./settings";

/** Playlists with the totals of the positions assigned to each one. */
export async function listPlaylistsWithTotals() {
  const [lists, allHoldings, syncedPositions, meta, conns, rates, base] = await Promise.all([
    db.select().from(playlists),
    db.select().from(holdings),
    db.select().from(positions),
    db.select().from(positionMeta),
    db.select().from(accountConnections),
    getRates(),
    getBaseCurrency(),
  ]);

  /**
   * Everything converted before it is added.
   *
   * A playlist can hold a euro ETF next to a dollar stock, and summing their
   * market values raw produced a total in no currency at all — then displayed
   * with the base currency's symbol. A holding with no available rate
   * contributes nothing rather than contributing a wrong number.
   */
  const inBase = (amount: number, currency: string): number =>
    toBase(amount, currency, rates, base) ?? 0;

  /**
   * A synced position can be put in a playlist, and this page used to ignore it.
   *
   * The tag is stored in `positionMeta`, not on the position row, because a
   * sync replaces `positions` wholesale. Reading only `holdings` meant a
   * playlist holding Bybit or IBKR trades reported the value and P&L of the
   * manual rows alone — while the Investments table, which reads both, showed a
   * different number for the same playlist. Two screens disagreeing about one
   * name is worse than either being wrong on its own.
   *
   * `capitalAtRisk` is the same helper the Investments page uses, so a
   * leveraged position contributes what it actually ties up rather than its
   * notional: a 5x short controlling 258 EUR is not 258 EUR of your money, and
   * adding that to an ETF's market value would make the column meaningless.
   */
  const currencyOf = new Map(conns.map((c) => [c.id, c.reportingCurrency ?? "USD"]));
  const playlistOfPosition = new Map(
    meta.filter((m) => m.playlistId).map((m) => [`${m.connectionId}:${m.coin}`, m.playlistId!])
  );

  const syncedByPlaylist = new Map<string, { value: number; pnl: number }[]>();
  for (const p of syncedPositions) {
    const playlistId = playlistOfPosition.get(`${p.connectionId}:${p.coin}`);
    if (!playlistId) continue;

    const risk = capitalAtRisk({
      positionValue: p.positionValue === null ? null : Number(p.positionValue),
      marginUsed: p.marginUsed === null ? null : Number(p.marginUsed),
      leverage: p.leverage === null ? null : Number(p.leverage),
    });

    const reported = currencyOf.get(p.connectionId) ?? "USD";
    const value = toBase(risk.atRisk, reported, rates, base);
    const pnl = toBase(p.unrealizedPnl === null ? 0 : Number(p.unrealizedPnl), reported, rates, base);
    // No rate means leave it out, never count it as zero.
    if (value === null || pnl === null) continue;

    const list = syncedByPlaylist.get(playlistId) ?? [];
    list.push({ value, pnl });
    syncedByPlaylist.set(playlistId, list);
  }

  return lists
    .map((p) => {
      const mine = allHoldings
        .filter((h) => h.playlistId === p.id)
        .map((h) => ({
          quantity: Number(h.quantity),
          avgEntryPrice: Number(h.avgEntryPrice),
          currentPrice: Number(h.currentPrice),
          direction: h.direction,
          realizedPnl: Number(h.realizedPnl ?? 0),
          currency: h.currency,
        }));

      const synced = syncedByPlaylist.get(p.id) ?? [];

      const value = round2(
        mine.reduce((s, h) => s + inBase(marketValue(h), h.currency), 0) +
          synced.reduce((s, x) => s + x.value, 0)
      );
      const pnl = round2(
        mine.reduce((s, h) => s + inBase(unrealizedPnL(h), h.currency), 0) +
          synced.reduce((s, x) => s + x.pnl, 0)
      );
      // What it was worth when it was opened. Derived rather than summed for
      // the synced side, because a perp has no cost basis of its own — the same
      // identity the manual side satisfies, where value − pnl is the cost.
      const cost = round2(
        mine.reduce((s, h) => s + inBase(costBasis(h), h.currency), 0) +
          synced.reduce((s, x) => s + (x.value - x.pnl), 0)
      );
      const realized = round2(mine.reduce((s, h) => s + inBase(h.realizedPnl, h.currency), 0));

      return {
        ...p,
        count: mine.length + synced.length,
        value,
        cost,
        pnl,
        pnlPercent: cost === 0 ? 0 : round2((pnl / cost) * 100),
        realized,
        /** Every figure above is in this currency. */
        currency: base,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export async function listPlaylists() {
  return db.select().from(playlists);
}

export async function createPlaylist(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  if (!name) throw new Error("Name is required");

  const [p] = await db.insert(playlists).values({ name, description, color }).returning();
  await db.insert(auditLog).values({
    entityType: "playlist",
    entityId: p.id,
    action: "playlist_created",
    details: JSON.stringify({ name }),
  });

  revalidatePath("/investments/playlists");
  revalidatePath("/investments");
}

export async function updatePlaylist(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  if (!name) throw new Error("Name is required");

  await db.update(playlists).set({ name, description, color, updatedAt: new Date() }).where(eq(playlists.id, id));
  revalidatePath("/investments/playlists");
  revalidatePath("/investments");
}

/** Deleting a playlist never deletes positions — they just become ungrouped. */
export async function deletePlaylist(formData: FormData) {
  const id = String(formData.get("id"));
  await db.insert(auditLog).values({ entityType: "playlist", entityId: id, action: "playlist_deleted" });
  await db.delete(playlists).where(eq(playlists.id, id));
  revalidatePath("/investments/playlists");
  revalidatePath("/investments");
}

// ---------------- Watchlist ----------------

export async function listWatchlist() {
  const [items, lists] = await Promise.all([db.select().from(watchlistItems), db.select().from(playlists)]);
  const nameOf = new Map(lists.map((p) => [p.id, p.name]));

  return items.map((w) => {
    const current = w.currentPrice === null ? null : Number(w.currentPrice);
    const target = w.targetPrice === null ? null : Number(w.targetPrice);
    return {
      ...w,
      currentPrice: current,
      targetPrice: target,
      playlistName: w.playlistId ? nameOf.get(w.playlistId) ?? null : null,
      // How far the price still has to move to reach the target.
      distancePercent:
        current && target && current !== 0 ? round2(((target - current) / current) * 100) : null,
      reached: current !== null && target !== null ? current <= target : false,
    };
  });
}

export async function addWatchlistItem(formData: FormData) {
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const assetType = String(formData.get("assetType") ?? "").trim() || null;
  const currentPrice = numeric(formData.get("currentPrice"));
  const targetPrice = numeric(formData.get("targetPrice"));
  const currency = String(formData.get("currency") ?? "EUR");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const playlistId = String(formData.get("playlistId") ?? "").trim() || null;

  if (!symbol) throw new Error("Symbol is required");

  await db
    .insert(watchlistItems)
    .values({ symbol, name, assetType, currentPrice, targetPrice, currency, notes, playlistId });

  revalidatePath("/investments/watchlist");
}

export async function updateWatchlistItem(formData: FormData) {
  const id = String(formData.get("id"));
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const assetType = String(formData.get("assetType") ?? "").trim() || null;
  const currentPrice = numeric(formData.get("currentPrice"));
  const targetPrice = numeric(formData.get("targetPrice"));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const playlistId = String(formData.get("playlistId") ?? "").trim() || null;

  if (!symbol) throw new Error("Symbol is required");

  await db
    .update(watchlistItems)
    .set({ symbol, name, assetType, currentPrice, targetPrice, notes, playlistId, updatedAt: new Date() })
    .where(eq(watchlistItems.id, id));

  revalidatePath("/investments/watchlist");
}

export async function deleteWatchlistItem(formData: FormData) {
  const id = String(formData.get("id"));
  await db.delete(watchlistItems).where(eq(watchlistItems.id, id));
  revalidatePath("/investments/watchlist");
}

function numeric(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
