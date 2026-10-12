import { describe, expect, it } from 'vitest';
import { classifiedPerformance, cleanPerformanceFilters, filterPerformanceInputs, performanceFilterOptions } from '../classifiedPerformance';
import { NONE } from '../../filters/multi';
import type { PositionItem } from '../positionView';
import type { TradeHistoryRow } from '../../trading/filter';

const open: PositionItem = { id: 'p1', symbol: 'BTC', side: 'short', accountId: null, accountName: 'A', platform: 'test',
  assetType: 'crypto', playlistNames: ['Strategy'], playlistIds: ['strategy'], riskLevel: 'low', expectedReturn: 'moderate',
  timeHorizon: 'short', liquidity: 'high', value: 120, notional: 120, leverage: null,
  pnl: 20, source: 'synced', insideBalance: true, apr: null };
const trade: TradeHistoryRow = { id: 't1', symbol: 'BTC', accountName: 'B', currency: 'EUR',
  date: '2026-09-10', type: 'SELL', quantity: 1, amount: 105, fees: 0, realizedPnl: 5,
  description: 'Close Short', tags: [], classification: { assetType: 'crypto', assetTypeAuto: false,
    playlistNames: ['Strategy'], playlistIds: [], riskLevel: 'low', expectedReturn: 'moderate',
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

  describe('filters of filters', () => {
    const etf: PositionItem = { ...open, id: 'p2', symbol: 'VWCE', side: 'long', accountName: 'B', assetType: 'etf',
      playlistNames: ['Core', 'Strategy'], playlistIds: ['core', 'strategy'], riskLevel: 'medium', value: 300, notional: 300, pnl: 30 };
    const bare: PositionItem = { ...open, id: 'p3', symbol: 'X', playlistNames: [], playlistIds: [], riskLevel: null, value: 50, notional: 50, pnl: 0 };

    it('takes several values in one field as alternatives and every field together', () => {
      const either = filterPerformanceInputs([open, etf, bare], [trade], { assetType: ['crypto', 'etf'] });
      expect(either.items.map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
      const both = filterPerformanceInputs([open, etf, bare], [trade], { assetType: ['crypto', 'etf'], account: ['B'] });
      expect(both.items.map(p => p.id)).toEqual(['p2']);
      expect(both.trades.map(t => t.id)).toEqual(['t1']);
    });

    it('picks what has nothing set with NONE, and a position in any chosen playlist', () => {
      expect(filterPerformanceInputs([open, etf, bare], [], { playlist: [NONE] }).items.map(p => p.id)).toEqual(['p3']);
      expect(filterPerformanceInputs([open, etf, bare], [], { playlist: ['Core'] }).items.map(p => p.id)).toEqual(['p2']);
      expect(filterPerformanceInputs([open, etf, bare], [], { riskLevel: ['low', NONE] }).items.map(p => p.id)).toEqual(['p1', 'p3']);
    });

    it('offers every value in view, not only what the filters leave, and says when some are unset', () => {
      const options = performanceFilterOptions([open, etf, bare], [trade]);
      expect(options.playlist).toEqual({ values: ['Core', 'Strategy'], unset: true });
      expect(options.account).toEqual({ values: ['A', 'B'], unset: false });
      expect(performanceFilterOptions([open, etf, bare], [trade], 'closed').account).toEqual({ values: ['B'], unset: false });
    });

    it('drops filter values that no longer exist and anything that is not a dimension', () => {
      const options = performanceFilterOptions([open, etf], []);
      expect(cleanPerformanceFilters({ playlist: ['Core', 'Gone', NONE], nonsense: ['x'], account: 'A' }, options))
        .toEqual({ playlist: ['Core', NONE], account: ['A'] });
      expect(cleanPerformanceFilters(null as never, options)).toEqual({});
    });

    it('splits each group again, the children summing from the same positions and trades', () => {
      const groups = classifiedPerformance([open, etf], [trade], 'account', 'both', 'riskLevel');
      const a = groups.find(g => g.key === 'A')!;
      expect(a.children!.map(c => [c.key, c.value, c.percent])).toEqual([['low', 120, 100]]);
      const b = groups.find(g => g.key === 'B')!;
      expect(b.children!.map(c => c.key).sort()).toEqual(['low', 'medium']);
      expect(b.children!.find(c => c.key === 'low')).toMatchObject({ value: 0, realized: 5, closedCount: 1 });
      expect(b.children!.find(c => c.key === 'medium')).toMatchObject({ value: 300, pnl: 30, percent: 100 });
    });

    it('counts a position whole in each playlist below a group, and does not split a group by itself', () => {
      const [group] = classifiedPerformance([etf], [], 'account', 'both', 'playlist');
      expect(group.children!.map(c => [c.key, c.value])).toEqual([['Core', 300], ['Strategy', 300]]);
      expect(classifiedPerformance([etf], [], 'account', 'both', 'account')[0].children).toBeUndefined();
      expect(classifiedPerformance([etf], [], 'account')[0].children).toBeUndefined();
    });
  });
});
