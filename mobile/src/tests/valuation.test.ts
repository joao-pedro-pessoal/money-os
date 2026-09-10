import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { account, stateWithAccounts } from './fixtures';
import { accountValue, applyReading, totalsByCurrency } from '../domain/operations';
import type { NormalizedAccountState } from '../../../src/lib/connectors/types';

function reading(over: Partial<NormalizedAccountState> = {}): NormalizedAccountState {
  return { currency: 'USD', equity: 100, withdrawable: 20, totalMarginUsed: 80, totalNotionalPosition: 800,
    asOf: new Date('2026-01-01T00:00:00Z'), positions: [], balances: [], spotValue: 0, balancesAreSeparatePool: false, ...over };
}
describe('mobile valuations reuse the net worth rules', () => {
  it('does not count leveraged exposure on top of equity', () => {
    const a = account({ platform: 'bybit', currency: 'USD' }); const state = stateWithAccounts(a);
    applyReading(state, a.id, reading(), '2026-01-01T12:00:00.000Z', randomUUID);
    expect(accountValue(state.accounts[0]).amount).toBe('100');
  });
  it('counts only balances explicitly outside equity and marks unpriced assets', () => {
    const a = account({ platform: 'hyperliquid', currency: 'USD' }); const state = stateWithAccounts(a);
    applyReading(state, a.id, reading({ balancesAreSeparatePool: true, balances: [
      { coin: 'A', total: 2, hold: 0, price: 10, usdValue: 20, costBasis: null },
      { coin: 'B', total: 3, hold: 0, price: null, usdValue: null, costBasis: null },
      { coin: 'USD', total: 80, hold: 80, price: 1, usdValue: 80, costBasis: null, countsInPortfolio: false },
    ] }), '2026-01-01T12:00:00.000Z', randomUUID);
    expect(accountValue(state.accounts[0])).toEqual({ amount: '120', partial: true });
  });
  it('keeps currencies apart and unknown readings visible', () => {
    const state = stateWithAccounts(account(), account({ currency: 'USD', balance: '50' }), account({ platform: 'trading212' }));
    expect(totalsByCurrency(state)).toEqual([
      { currency: 'EUR', value: '100', partial: true, missing: 1 },
      { currency: 'USD', value: '50', partial: false, missing: 0 },
    ]);
  });
});
