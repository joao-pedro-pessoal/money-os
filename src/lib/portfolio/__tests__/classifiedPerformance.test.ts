import { describe, expect, it } from 'vitest';
import { classifiedPerformance } from '../classifiedPerformance';
import type { PositionItem } from '../positionView';
import type { TradeHistoryRow } from '../../trading/filter';

const open: PositionItem = { id: 'p1', symbol: 'BTC', side: 'short', accountName: 'A', platform: 'test',
  assetType: 'crypto', playlistName: 'Strategy', riskLevel: 'low', expectedReturn: 'moderate',
  timeHorizon: 'short', liquidity: 'high', value: 120, notional: 120, leverage: null,
  pnl: 20, source: 'synced', insideBalance: true, apr: null };
const trade: TradeHistoryRow = { id: 't1', symbol: 'BTC', accountName: 'B', currency: 'EUR',
  date: '2026-09-10', type: 'SELL', quantity: 1, amount: 105, fees: 0, realizedPnl: 5,
  description: 'Close Short', tags: [], classification: { assetType: 'crypto', assetTypeAuto: false,
    playlistName: 'Strategy', playlistId: null, riskLevel: 'low', expectedReturn: 'moderate',
    timeHorizon: 'short', liquidity: 'high', apr: null, notes: null } };

describe('classified performance', () => {
  it('filters both totals and members to open positions or closed trades', () => {
    const [opened] = classifiedPerformance([open], [trade], 'timeHorizon', 'open');
    expect(opened).toMatchObject({ count: 1, pnl: 20, realized: 0, value: 120 });
    expect(opened.members.map(m => m.status)).toEqual(['open']);
    const [closed] = classifiedPerformance([open], [trade], 'timeHorizon', 'closed');
    expect(closed).toMatchObject({ count: 1, pnl: 0, realized: 5, value: 0 });
    expect(closed.members.map(m => m.status)).toEqual(['closed']);
    expect(classifiedPerformance([], [trade], 'timeHorizon', 'open')).toEqual([]);
    expect(classifiedPerformance([open], [], 'timeHorizon', 'closed')).toEqual([]);
  });
  it.each(['timeHorizon', 'riskLevel', 'expectedReturn', 'liquidity', 'assetType', 'playlist', 'direction'] as const)(
    'combines matching open positions and historical executions by %s', key => {
      const [group] = classifiedPerformance([open], [trade], key);
      expect(group).toMatchObject({ count: 2, value: 120, pnl: 20, realized: 5, openCount: 1, closedCount: 1 });
    });
  it('keeps different tags on the same ticker separate and includes fully closed assets', () => {
    const groups = classifiedPerformance([open], [trade, { ...trade, id: 't2', symbol: 'SOLD', realizedPnl: -3,
      classification: { ...trade.classification!, timeHorizon: 'long' } }], 'timeHorizon');
    expect(groups.find(g => g.key === 'short')).toMatchObject({ pnl: 20, realized: 5 });
    expect(groups.find(g => g.key === 'long')).toMatchObject({ value: 0, pnl: 0, realized: -3, count: 1 });
  });
  it('does not inherit current tags, duplicate IDs, or include events without realised P&L', () => {
    const groups = classifiedPerformance([open, open], [trade, trade, { ...trade, id: 't2', classification: null },
      { ...trade, id: 'missing', realizedPnl: null }, { ...trade, id: 'opening', description: 'Open Short', realizedPnl: 0 }], 'timeHorizon');
    expect(groups.find(g => g.key === 'short')).toMatchObject({ count: 2, realized: 5, pnl: 20 });
    expect(groups.find(g => g.key === 'Unset')).toMatchObject({ count: 1, realized: 5 });
  });
  it('does not manufacture unrealised returns when entry cost is unknown', () => {
    const [group] = classifiedPerformance([{ ...open, costUnknown: true }], [], 'timeHorizon');
    expect(group).toMatchObject({ pnl: 0, cost: 0 });
    expect(group.members[0].pnlKnown).toBe(false);
  });
});
