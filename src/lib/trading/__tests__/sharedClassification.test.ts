import { describe, it, expect } from 'vitest';
import { shareTradeClassification } from '../sharedClassification';
import { isRealisedTrade } from '../tradeMatches';
import type { TradeHistoryRow } from '../filter';

type Classification = NonNullable<TradeHistoryRow['classification']>;

const sato: Classification = {
  assetType: null, assetTypeAuto: false, riskLevel: 'high', expectedReturn: null, timeHorizon: null,
  liquidity: null, apr: null, playlistId: 'p-sato', playlistName: 'Sato', notes: 'my short',
};
const other: Classification = { ...sato, playlistId: 'p-other', playlistName: 'Other', notes: null };
const empty: Classification = { ...sato, riskLevel: null, playlistId: null, playlistName: null, notes: null };

const fill = (id: string, date: string, description: string, quantity: number, realizedPnl: number | null,
  extra: Partial<TradeHistoryRow> = {}): TradeHistoryRow => ({
  id, accountId: 'hl', accountName: 'Hyperliquid', connectionId: 'c', currency: 'USD', date, symbol: 'ZRO',
  type: 'SELL', quantity, amount: 10, fees: null, realizedPnl, description, tags: [], classification: null, ...extra,
});

/** The live account's ZRO short: opened in three fills, closed in three, one of them classified. */
const zro = () => [
  fill('o1', '2026-08-26T09:41:28.000Z', 'Open Short', 63, null),
  fill('o2', '2026-08-26T09:41:28.000Z', 'Open Short', 2.1, null),
  fill('o3', '2026-08-26T09:41:28.000Z', 'Open Short', 63, null),
  fill('c1', '2026-08-26T15:49:24.000Z', 'Close Short', 43, 1.91, { classification: sato }),
  fill('c2', '2026-08-26T15:49:24.000Z', 'Close Short', 32.6, 1.45),
  fill('c3', '2026-08-26T15:49:24.000Z', 'Close Short', 52.5, 2.32),
];

const playlistRealised = (rows: TradeHistoryRow[], playlistId: string) =>
  Math.round(rows.filter((r) => isRealisedTrade(r) && r.classification?.playlistId === playlistId)
    .reduce((s, r) => s + r.realizedPnl!, 0) * 100) / 100;

describe('a trade split into several fills is classified whole', () => {
  it('counts the whole result in the playlist, not the one fill that was clicked', () => {
    expect(playlistRealised(zro(), 'p-sato')).toBe(1.91);
    expect(playlistRealised(shareTradeClassification(zro()), 'p-sato')).toBe(5.68);
  });

  it('marks what was shared, and keeps the notes on the fill they were written on', () => {
    const rows = shareTradeClassification(zro());
    const c2 = rows.find((r) => r.id === 'c2')!;
    expect(c2.classification).toMatchObject({ playlistId: 'p-sato', sharedFrom: 'c1', notes: null });
    expect(rows.find((r) => r.id === 'c1')!.classification).toBe(sato);
  });

  it('gives a closing fill the classification of what it closed, on another day', () => {
    const rows = shareTradeClassification([
      fill('o1', '2026-09-01T10:00:00.000Z', 'Open Short', 10, null, { classification: sato }),
      fill('c1', '2026-09-03T10:00:00.000Z', 'Close Short', 4, 1),
      fill('c2', '2026-09-05T10:00:00.000Z', 'Close Short', 6, 2),
    ]);
    expect(playlistRealised(rows, 'p-sato')).toBe(3);
  });

  it("never overrides a fill's own classification, even one saved empty", () => {
    const rows = shareTradeClassification(zro().map((r) =>
      r.id === 'c2' ? { ...r, classification: other } : r.id === 'c3' ? { ...r, classification: empty } : r));
    expect(rows.find((r) => r.id === 'c2')!.classification?.playlistId).toBe('p-other');
    expect(rows.find((r) => r.id === 'c3')!.classification?.playlistId).toBeNull();
  });

  it('shares nothing when the rest of the trade disagrees', () => {
    const rows = shareTradeClassification(zro().map((r) => (r.id === 'c2' ? { ...r, classification: other } : r)));
    expect(rows.find((r) => r.id === 'c3')!.classification).toBeNull();
  });

  it('keeps other instruments, accounts and moments apart', () => {
    const rows = shareTradeClassification([
      fill('c1', '2026-08-26T15:49:24.000Z', 'Close Short', 1, 1, { classification: sato }),
      fill('x1', '2026-08-26T15:49:24.000Z', 'Close Short', 1, 1, { symbol: 'HYPE' }),
      fill('x2', '2026-08-26T15:49:24.000Z', 'Close Short', 1, 1, { accountId: 'mexc' }),
      fill('x3', '2026-08-26T15:49:25.000Z', 'Close Short', 1, 1),
    ]);
    for (const id of ['x1', 'x2', 'x3']) expect(rows.find((r) => r.id === id)!.classification).toBeNull();
  });

  it('leaves rows alone when nothing is classified', () => {
    const rows = zro().map((r) => ({ ...r, classification: null }));
    expect(shareTradeClassification(rows)).toEqual(rows);
  });
});
