"use server";

import { db } from "@/db/client";
import { playlists, holdings, watchlistItems, auditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { marketValue, costBasis, unrealizedPnL } from "@/lib/portfolio";

/** Playlists with the totals of the positions assigned to each one. */
export async function listPlaylistsWithTotals() {
  const [lists, allHoldings] = await Promise.all([
    db.select().from(playlists),
    db.select().from(holdings),
  ]);

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
        }));

      const value = round2(mine.reduce((s, h) => s + marketValue(h), 0));
      const cost = round2(mine.reduce((s, h) => s + costBasis(h), 0));
      const pnl = round2(mine.reduce((s, h) => s + unrealizedPnL(h), 0));
      const realized = round2(mine.reduce((s, h) => s + h.realizedPnl, 0));

      return {
        ...p,
        count: mine.length,
        value,
        cost,
        pnl,
        pnlPercent: cost === 0 ? 0 : round2((pnl / cost) * 100),
        realized,
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
