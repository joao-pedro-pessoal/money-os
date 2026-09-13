import { describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { account, stateWithAccounts } from './fixtures';
import { type LocalEvent, validateState } from '../domain/model';
import { deleteEvent, linkLocalCashback, recordCash, setPurchaseSavings, unlinkLocalCashback } from '../domain/operations';
import { mergeStates } from '../domain/merge';
import { decryptBackup, encryptBackup } from '../domain/backup';
import { savingsReport } from '../../../src/lib/money/savings';
import { LocalVault } from '../storage/repository';

function event(accountId: string, overrides: Partial<LocalEvent> = {}): LocalEvent {
  return { id: randomUUID(), accountId, amount: '-80', type: 'EXPENSE', currency: 'EUR', date: '2026-01-01T12:00:00.000Z',
    description: 'Purchase', source: 'manual', externalId: '', transferId: null, symbol: '', quantity: null, price: null, fees: null, ...overrides };
}

describe('local purchase savings', () => {
  it('changes balances only for actual money movements, including reversal and undo', () => {
    const a = account(), state = stateWithAccounts(a), p = event(a.id);
    recordCash(state, p);
    setPurchaseSavings(state, p.id, { originalPrice: '100', expected: '5' });
    expect(a.balance).toBe('20');
    const receipt = event(a.id, { amount: '5', type: 'INCOME', cashbackForId: p.id });
    recordCash(state, receipt);
    expect(a.balance).toBe('25');
    expect(savingsReport(state.events).totals[0].total).toBe(25);
    const reversal = event(a.id, { amount: '-3', cashbackForId: p.id });
    recordCash(state, reversal);
    setPurchaseSavings(state, p.id, { discount: '10', expected: '2' });
    expect(a.balance).toBe('22');
    expect(savingsReport(state.events).totals[0]).toMatchObject({ total: 12, pending: 0 });
    deleteEvent(state, reversal.id);
    expect(a.balance).toBe('25');
    deleteEvent(state, p.id);
    expect(a.balance).toBe('105');
    expect(state.events[0].cashbackForId).toBeNull();
    expect(() => validateState(state)).not.toThrow();
  });
  it('links imported receipts idempotently without adding money, and refuses a second purchase', () => {
    const a = account(), state = stateWithAccounts(a);
    const p = event(a.id, { source: 'csv', externalId: 'purchase' });
    const r = event(a.id, { source: 'csv', externalId: 'cashback', type: 'INCOME', amount: '5' });
    const other = event(a.id);
    state.events.push(p, r, other);
    linkLocalCashback(state, r.id, p.id); linkLocalCashback(state, r.id, p.id);
    expect(a.balance).toBe('100');
    expect(savingsReport(state.events).totals[0].received).toBe(5);
    expect(() => linkLocalCashback(state, r.id, other.id)).toThrow();
    unlinkLocalCashback(state, r.id, p.id);
    expect(a.balance).toBe('100');
    expect(state.events).toHaveLength(3);
  });
  it('preserves cashback references when duplicate imports use different device IDs', () => {
    const a = account(), base = stateWithAccounts(a), local = structuredClone(base), remote = structuredClone(base);
    const p = event(a.id, { source: 'csv', externalId: 'same-purchase', discountAmount: '20' });
    const r = event(a.id, { source: 'csv', externalId: 'same-receipt', type: 'INCOME', amount: '5', cashbackForId: p.id });
    local.events.push(p, r);
    const remotePurchase = { ...p, id: randomUUID() };
    remote.events.push(remotePurchase, { ...r, id: randomUUID(), cashbackForId: remotePurchase.id });
    const merged = mergeStates(base, local, remote);
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error(merged.problems.join());
    expect(merged.conflicts).toEqual([]);
    expect(merged.state.events).toHaveLength(2);
    expect(savingsReport(merged.state.events).totals[0].total).toBe(25);
    const repeat = mergeStates(merged.state, merged.state, merged.state);
    expect(repeat.ok && repeat.state.events).toEqual(merged.state.events);
  });
  it('recomputes concurrent real receipts once and keeps independent savings edits', () => {
    const a = account(), base = stateWithAccounts(a), p = event(a.id);
    recordCash(base, p);
    const local = structuredClone(base), remote = structuredClone(base);
    setPurchaseSavings(local, p.id, { discount: '20', expected: '5' });
    recordCash(remote, event(a.id, { amount: '5', type: 'INCOME', cashbackForId: p.id }));
    const merged = mergeStates(base, local, remote);
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error(merged.problems.join());
    expect(merged.state.accounts[0].balance).toBe('25');
    expect(savingsReport(merged.state.events).totals[0].total).toBe(25);
  });
  it('rejects dangling or cross-currency links and incompatible benefits on restore', () => {
    const a = account(), state = stateWithAccounts(a), p = event(a.id);
    state.events.push(p, event(a.id, { type: 'INCOME', amount: '5', cashbackForId: randomUUID() }));
    expect(() => validateState(state)).toThrow();
    state.events[1].cashbackForId = p.id; state.events[1].currency = 'USD';
    expect(() => validateState(state)).toThrow();
    state.events[1].currency = 'EUR'; state.events[1].discountAmount = '1';
    expect(() => validateState(state)).toThrow();
  });
  it('round-trips benefits and receipt links through an encrypted backup', async () => {
    const a = account(), state = stateWithAccounts(a), p = event(a.id, { discountAmount: '20', cashbackExpected: '5', categoryId: 'Compras' });
    recordCash(state, p); recordCash(state, event(a.id, { amount: '5', type: 'INCOME', cashbackForId: p.id }));
    const encrypted = await encryptBackup(state, 'long-test-password', async n => randomBytes(n));
    expect(encrypted).not.toContain('Compras');
    expect(await decryptBackup(encrypted, 'long-test-password')).toEqual(validateState(state));
  }, 20000);
  it('keeps the previous document and balance after a failed atomic save', async () => {
    const a = account(), state = stateWithAccounts(a);
    const vault = await LocalVault.open({ read: async () => JSON.stringify(state), write: async () => { throw new Error('disk full'); },
      close: async () => {}, readSyncBase: async () => null, writeWithSyncBase: async () => {} });
    await expect(vault.update(draft => recordCash(draft, event(a.id, { discountAmount: '20' })))).rejects.toThrow('disk full');
    expect(vault.snapshot()).toEqual(state);
  });
});
