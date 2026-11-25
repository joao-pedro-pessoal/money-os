"use server";
import { requireInvestments } from "./releaseEdition";

import { hasSession } from './session';
import { db } from '@/db/client';
import { holdings, watchlistItems, positions, platformBalances } from '@/db/schema';
import { searchQuery, parseAssetSuggestions, mergeAssetSuggestions, type AssetSuggestion } from '@/lib/quotes/assetSearch';
import { knownListingFor } from '@/lib/quotes/knownListings';
import { withWork, WorkLimitedError } from './workGate';
import { providerJson } from './providerHttp';
import { currentLanguage } from './language';
import { readText } from '@/lib/accounts/readText';

export async function searchAssets(raw: string): Promise<{ results: AssetSuggestion[]; warning: string | null; retryAfter?: number }> {
  await requireInvestments();
  if (!(await hasSession())) throw new Error('Sign in again.');
  const text = readText(await currentLanguage());
  if (typeof raw !== 'string' || raw.length > 200) return { results: [], warning: text.searchInvalid };
  const query = searchQuery(raw);
  if (query.length < 2) return { results: [], warning: null };
  try { return await withWork('asset-search', () => performSearch(raw, query, text.searchFailed)); }
  catch (error) {
    if (error instanceof WorkLimitedError) return { results: [], warning: text.limited(error.retryAfter), retryAfter: error.retryAfter };
    return { results: [], warning: text.searchFailed };
  }
}

async function performSearch(raw: string, query: string, unavailable: string) {
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
    const remote = parseAssetSuggestions(await providerJson(url));
    return { results: mergeAssetSuggestions(raw, local, [...verified, ...remote]), warning: null };
  } catch {
    return { results: mergeAssetSuggestions(raw, local, verified), warning: unavailable };
  }
}
