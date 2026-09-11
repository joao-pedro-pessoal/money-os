import { describe, expect, it } from 'vitest';
import { dailyRealisedPnl, monthDays, shiftMonth } from '../pnlCalendar';
import type { TradeHistoryRow } from '../filter';

const trade = (id: string, date: string, realizedPnl: number | null): TradeHistoryRow => ({
  id, date, realizedPnl, type: 'SELL', symbol: 'BTC', quantity: 1, amount: 100,
  fees: 2, description: 'Close Long', accountName: 'Broker', currency: 'EUR', tags: [],
});

describe('daily realised P&L calendar', () => {
  it('sums closed trades per UTC day without subtracting fees again or duplicating IDs', () => {
    const a = trade('a', '2026-09-10T10:00:00Z', 12);
    const days = dailyRealisedPnl([a, a, trade('b', '2026-09-10T18:00:00Z', -5), trade('c', '2026-09-11T01:00:00+02:00', 3)]);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: '2026-09-10', pnl: 10 });
    expect(days[0].trades).toHaveLength(3);
  });
  it('keeps breakeven days distinct from days without trades and ignores non-trades', () => {
    expect(dailyRealisedPnl([
      trade('zero', '2026-09-10', 0), trade('missing', '2026-09-11', null),
      { ...trade('opening', '2026-09-11', 0), description: 'Open Long' },
      { ...trade('deposit', '2026-09-11', 50), type: 'DEPOSIT' },
      trade('invalid', 'bad date', 1),
    ])).toMatchObject([{ date: '2026-09-10', pnl: 0 }]);
  });
  it('builds Monday-first weeks including leap days and year transitions', () => {
    const feb = monthDays('2024-02');
    expect(feb.slice(0, 4)).toEqual([null, null, null, '2024-02-01']);
    expect(feb.filter(Boolean)).toHaveLength(29);
    expect(feb.length % 7).toBe(0);
    expect(monthDays('2025-02').filter(Boolean)).toHaveLength(28);
    expect(monthDays('2026-13')).toEqual([]);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
