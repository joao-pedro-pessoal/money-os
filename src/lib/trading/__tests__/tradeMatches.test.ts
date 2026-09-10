import { describe, it, expect } from 'vitest';
import { isRealisedTrade, matchTradeOpenings } from '../tradeMatches';
import type { TradeHistoryRow } from '../filter';

const row = (id: string, type: string, quantity: number, extra: Partial<TradeHistoryRow> = {}): TradeHistoryRow => ({
  id, accountId: 'a', accountName: 'Account', connectionId: 'c', currency: 'USD',
  date: `2026-01-0${id}T12:00:00Z`, symbol: 'BTC', type, quantity, amount: 100, fees: null,
  realizedPnl: type === 'SELL' ? 2 : null, description: null, tags: [], ...extra,
});
describe('individual realised trades', () => {
  it('uses position IDs even when FIFO would pick another position', () => {
    const m = matchTradeOpenings([
      row('1', 'BUY', 2, { brokerPositionId: 'A' }),
      row('2', 'BUY', 3, { brokerPositionId: 'B' }),
      row('3', 'SELL', 1, { brokerPositionId: 'B' }),
      row('4', 'SELL', 2, { brokerPositionId: 'A' }),
      row('5', 'SELL', 3, { brokerPositionId: 'B' }),
    ]);
    expect(m.get('3')).toMatchObject({ method: 'broker-position', openings: [{ id: '2', quantity: 1 }], unmatched: 0 });
    expect(m.get('4')?.openings[0].id).toBe('1');
    expect(m.get('5')).toMatchObject({ openings: [{ id: '2', quantity: 2 }], unmatched: 1 });
  });
  it('does not fall back to unrelated or unidentified positions for an explicit ID', () => {
    for (const brokerPositionId of [null, 'A']) {
      const m = matchTradeOpenings([row('1', 'BUY', 1, { brokerPositionId }), row('2', 'SELL', 1, { brokerPositionId: 'B' })]);
      expect(m.get('2')).toMatchObject({ openings: [], unmatched: 1 });
    }
  });
  it('reports broker summaries without consuming fills or manufacturing opening executions', () => {
    const m = matchTradeOpenings([row('1', 'BUY', 2), row('2', 'SELL', 2, {
      brokerPositionId: 'MEXC-1', brokerPositionSummary: true, brokerOpenedAt: '2025-12-31T12:00:00Z',
    }), row('3', 'SELL', 2)]);
    expect(m.get('2')).toMatchObject({ method: 'broker-summary', openings: [], openedAt: '2025-12-31T12:00:00.000Z' });
    expect(m.get('3')).toMatchObject({ method: 'fifo', openings: [{ id: '1', quantity: 2 }] });
  });
  it('keeps a summary without quantity and rejects invalid or future opening dates', () => {
    for (const brokerOpenedAt of ['invalid', '2027-01-01', null]) {
      expect(matchTradeOpenings([row('2', 'SELL', 1, { quantity: null, brokerPositionSummary: true,
        brokerPositionId: 'A', brokerOpenedAt })]).get('2')?.openedAt).toBeNull();
    }
  });
  it('does not duplicate fills and orders openings first at equal timestamps', () => {
    const open = row('2', 'BUY', 1, { date: '2026-01-01T12:00:00Z' });
    const close = row('1', 'SELL', 2, { date: open.date });
    expect(matchTradeOpenings([close, open, open]).get('1')).toMatchObject({ openings: [{ id: '2', quantity: 1 }], unmatched: 1 });
  });
  it('scopes explicit position IDs to the same account, connection and currency', () => {
    for (const extra of [{ accountId: 'other' }, { connectionId: 'other' }, { currency: 'EUR' }]) {
      const m = matchTradeOpenings([row('1','BUY',1,{brokerPositionId:'A'}), row('2','SELL',1,{brokerPositionId:'A',...extra})]);
      expect(m.get('2')?.unmatched).toBe(1);
    }
  });
  it('keeps real zero results but excludes missing results and opening fills reporting zero', () => {
    expect(isRealisedTrade(row('1', 'SELL', 1, { realizedPnl: 0 }))).toBe(true);
    expect(isRealisedTrade(row('1', 'SELL', 1, { realizedPnl: null }))).toBe(false);
    expect(isRealisedTrade(row('1', 'BUY', 1, { realizedPnl: 0, description: 'Open Long' }))).toBe(false);
    expect(isRealisedTrade(row('1', 'FEE', 1))).toBe(false);
  });
  it('separates consecutive trades of the same ticker', () => {
    const m = matchTradeOpenings([row('4','SELL',1), row('1','BUY',1), row('3','BUY',1), row('2','SELL',1)]);
    expect(m.get('2')?.openings[0].id).toBe('1');
    expect(m.get('4')?.openings[0].id).toBe('3');
  });
  it('consumes partial closes without reusing already closed units', () => {
    const m = matchTradeOpenings([row('1','BUY',3),row('2','SELL',1),row('3','SELL',3)]);
    expect(m.get('2')?.openings[0].quantity).toBe(1);
    expect(m.get('3')).toMatchObject({ unmatched: 1, openings: [{ quantity: 2 }] });
  });
  it('never pairs different accounts, connections or currencies', () => {
    for (const extra of [{ accountId: 'b' }, { connectionId: 'd' }, { currency: 'EUR' }]) {
      expect(matchTradeOpenings([row('1','BUY',1),row('2','SELL',1,extra)]).get('2')?.unmatched).toBe(1);
    }
  });
  it('pairs explicit short opens and closes', () => {
    const m = matchTradeOpenings([row('1','SELL',1,{description:'Open Short',realizedPnl:0}),row('2','BUY',1,{description:'Close Short',realizedPnl:4})]);
    expect(m.get('2')?.openings[0].id).toBe('1');
  });
});
