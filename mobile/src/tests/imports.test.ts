import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { previewCsv, commitCsv } from '../domain/imports';
import { account, stateWithAccounts } from './fixtures';
const header = 'date,type,symbol,quantity,price,amount,fees,currency,description,external_id';
describe('local CSV imports', () => {
  it('preserves two identical events without IDs, but reimporting the file adds nothing', () => {
    const a = account(); const state = stateWithAccounts(a);
    const text = `${header}\n2026-01-02,DIVIDEND,ABC,,,1,,EUR,Payment,\n2026-01-02,DIVIDEND,ABC,,,1,,EUR,Payment,`;
    const first = previewCsv(text, state, a.id, 'broker', randomUUID);
    expect(first.problems).toEqual([]); expect(first.rows).toHaveLength(2);
    commitCsv(state, first);
    const second = previewCsv(text, state, a.id, 'broker', randomUUID);
    expect(second.rows).toHaveLength(0); expect(second.duplicates).toBe(2);
    expect(state.accounts[0].balance).toBe('100');
  });
  it('refuses a whole import containing malformed required data', () => {
    const a = account(); const state = stateWithAccounts(a);
    const preview = previewCsv(`${header}\n2026-02-30,DEPOSIT,,,,100,,EUR,Invalid date,\n2026-01-02,DEPOSIT,,,,,,EUR,Missing amount,`, state, a.id, 'broker', randomUUID);
    expect(preview.problems).toHaveLength(2);
    expect(() => commitCsv(state, preview)).toThrow(); expect(state.events).toHaveLength(0);
  });
  it('does not turn the bank statement currency into the account currency', () => {
    const a = account(); const state = stateWithAccounts(a);
    const preview = previewCsv('date,amount,currency,description\n2026-01-02,-10,USD,Coffee', state, a.id, 'bank', randomUUID);
    expect(preview.problems).toHaveLength(1);
  });
  it('does not deduct fees twice', () => {
    const a = account(); const state = stateWithAccounts(a);
    const preview = previewCsv(`${header}\n2026-01-02,BUY,ABC,1,10,-11,1,EUR,Purchase,order1`, state, a.id, 'broker', randomUUID);
    expect(preview.rows[0].amount).toBe('-11'); expect(preview.rows[0].fees).toBe(1);
  });
});
