"use server";

import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, expectedSessionValue } from '@/lib/auth';
import { db } from '@/db/client';
import { holdings, watchlistItems, positions, platformBalances } from '@/db/schema';
import { searchQuery, parseAssetSuggestions, mergeAssetSuggestions, type AssetSuggestion } from '@/lib/quotes/assetSearch';
import { knownListingFor } from '@/lib/quotes/knownListings';

export async function searchAssets(raw: string): Promise<{ results: AssetSuggestion[]; warning: string | null }> {
  if ((await cookies()).get(SESSION_COOKIE_NAME)?.value !== await expectedSessionValue()) throw new Error('Sign in again.');
  const query = searchQuery(raw);
  if (query.length < 2) return { results: [], warning: null };
  const [manual, watching, live, balances] = await Promise.all([
    db.select({ symbol: holdings.symbol, name: holdings.name, assetType: holdings.assetType }).from(holdings),
    db.select({ symbol: watchlistItems.symbol, name: watchlistItems.name, assetType: watchlistItems.assetType }).from(watchlistItems),
    db.select({ symbol: positions.coin }).from(positions),
    db.select({ symbol: platformBalances.coin }).from(platformBalances),
  ]);
  const local: AssetSuggestion[] = [...manual, ...watching, ...live.map(p => ({ ...p, name: p.symbol, assetType: null })),
    ...balances.map(p => ({ ...p, name: p.symbol, assetType: null }))].map(p => ({ ...p, name: p.name || p.symbol, exchange: null, source: 'portfolio' }));
  const known = knownListingFor(query);
  const verified: AssetSuggestion[] = known ? [{ symbol: known.symbol, name: known.name, assetType: 'etf', exchange: null, source: 'verified listing' }] : [];
  try {
    const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
    url.search = new URLSearchParams({ q: known?.symbol ?? query, quotesCount: '10', newsCount: '0', enableFuzzyQuery: 'false' }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
    if (!response.ok) throw new Error('Search unavailable');
    const remote = parseAssetSuggestions(await response.json());
    return { results: mergeAssetSuggestions(raw, local, [...verified, ...remote]), warning: null };
  } catch {
    return { results: mergeAssetSuggestions(raw, local, verified), warning: 'Online search is unavailable. Your saved assets are still searchable; you can also type a ticker manually.' };
  }
}
