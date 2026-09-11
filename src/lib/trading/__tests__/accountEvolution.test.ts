import { expect, it } from 'vitest';
import { accountBalanceHistory } from '../accountEvolution';

it('uses the last observation per UTC day, never adding account snapshots', () => {
  expect(accountBalanceHistory('USD', [
    { timestamp: '2026-09-10T22:00:00Z', balance: 110, currency: 'USD' },
    { timestamp: '2026-09-10T08:00:00Z', balance: 100, currency: 'USD' },
    { timestamp: '2026-09-12T01:00:00+02:00', balance: 0, currency: 'USD' },
  ])).toEqual({ points: [{ date: '2026-09-10', value: 110 }, { date: '2026-09-11', value: 0 }], omitted: 0, assumedCurrency: false });
});

it('does not mix historical currencies and reports legacy or invalid snapshots', () => {
  expect(accountBalanceHistory('EUR', [
    { timestamp: '2026-09-10T08:00:00Z', balance: 100, currency: 'USD' },
    { timestamp: '2026-09-11T08:00:00Z', balance: 90, currency: null },
    { timestamp: 'invalid', balance: 50, currency: 'EUR' },
  ])).toEqual({ points: [{ date: '2026-09-11', value: 90 }], omitted: 2, assumedCurrency: true });
  expect(accountBalanceHistory('EUR', []).points).toEqual([]);
});
