"use server";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { listHoldingsWithPnL } from "./investments";
import { listAllPositions, listBalances } from "./connections";
import { cookies } from "next/headers";
import { expectedSessionValue, SESSION_COOKIE_NAME } from "@/lib/auth";

const keyFor = (symbol: string) => `asset_note:${symbol.trim().toUpperCase()}`;

export async function getAssetInfo(symbol: string) {
  const [manual, positions, balances, notes] = await Promise.all([
    listHoldingsWithPnL(), listAllPositions(), listBalances(),
    db.select().from(appSettings).where(eq(appSettings.key, keyFor(symbol))),
  ]);
  const same = (value: string) => value.trim().toUpperCase() === symbol.trim().toUpperCase();
  // Keep each account/source in its own denomination: prices in different
  // currencies or quote units must never be averaged together.
  const entries = [
    ...manual.holdings.filter(h => same(h.symbol)).map(h => ({ id: `h:${h.id}`, account: h.accountName ?? 'Manual', quantity: h.quantity, averagePrice: h.avgEntryPrice, currency: h.currency })),
    ...positions.filter(p => same(p.coin)).map(p => ({ id: `p:${p.id}`, account: p.accountName, quantity: p.size, averagePrice: p.entryPrice, currency: 'broker quote units' })),
    ...balances.filter(b => same(b.coin)).map(b => ({ id: `b:${b.id}`, account: b.accountName, quantity: b.total, averagePrice: b.total > 0 && b.costBasis !== null ? b.costBasis / b.total : null, currency: b.currency })),
  ];
  return { entries, note: notes[0]?.value ?? '' };
}

export async function saveAssetNote(formData: FormData) {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== await expectedSessionValue()) throw new Error("Sign in again.");
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return;
  const value = String(formData.get("note") ?? "").trim();
  if (symbol.length > 500 || value.length > 20000) throw new Error("Note is too long.");
  await db.insert(appSettings).values({ key: keyFor(symbol), value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  revalidatePath(`/investments/asset/${encodeURIComponent(symbol)}`);
}
