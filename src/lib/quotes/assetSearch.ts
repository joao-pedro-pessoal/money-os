export interface AssetSuggestion {
  symbol: string;
  name: string;
  assetType: string | null;
  exchange: string | null;
  source: 'portfolio' | 'Yahoo Finance' | 'verified listing';
}

export function searchQuery(raw: string): string {
  const query = raw.trim().replace(/\s+/g, ' ').slice(0, 100);
  return /^(?:s\s*&?\s*p\s*500|spx)$/i.test(query) ? '^GSPC' : query;
}

export function parseAssetSuggestions(payload: unknown): AssetSuggestion[] {
  if (!payload || typeof payload !== 'object' || !('quotes' in payload) || !Array.isArray(payload.quotes)) return [];
  const types: Record<string, string> = { EQUITY: 'stock', ETF: 'etf', INDEX: 'index', CRYPTOCURRENCY: 'crypto', MUTUALFUND: 'other', FUTURE: 'commodity' };
  return payload.quotes.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.symbol !== 'string' || typeof row.quoteType !== 'string' || !types[row.quoteType]) return [];
    return [{ symbol: row.symbol.slice(0, 100), name: String(row.longname ?? row.shortname ?? row.symbol).slice(0, 250),
      assetType: types[row.quoteType], exchange: typeof row.exchDisp === 'string' ? row.exchDisp : typeof row.exchange === 'string' ? row.exchange : null,
      source: 'Yahoo Finance' as const }];
  });
}

export function mergeAssetSuggestions(query: string, local: AssetSuggestion[], remote: AssetSuggestion[]): AssetSuggestion[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = local.filter(r => words.every(w => normalize(`${r.symbol} ${r.name}`).includes(w)));
  const seen = new Set<string>();
  return [...matches, ...remote].filter(r => {
    const key = r.symbol.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 12);
}
