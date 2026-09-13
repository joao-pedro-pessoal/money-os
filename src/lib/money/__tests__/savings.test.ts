import { describe, expect, it } from 'vitest';
import { assertCashbackLink, purchaseSavings, savingsReport, validateSavingsRecords, type SavingsTransaction } from '../savings';

const purchase: SavingsTransaction = { id: 'purchase', type: 'expense', amount: '-80.00', currency: 'EUR', accountId: 'a', date: '2026-01-10', categoryId: 'food', discountAmount: '20.00', cashbackExpected: '5.00' };
const receipt: SavingsTransaction = { id: 'receipt', type: 'income', amount: '5.00', currency: 'EUR', accountId: 'b', date: '2026-02-10', cashbackForId: 'purchase' };

describe('purchase savings', () => {
  it('derives a single discount from original price without changing paid amount', () => {
    expect(purchaseSavings('expense', '80', { originalPrice: '100', expected: '5' })).toEqual({ discountAmount: '20.00', cashbackExpected: '5.00' });
    expect(purchaseSavings('expense', '80', { originalPrice: '100', discount: '20' }).discountAmount).toBe('20.00');
    expect(() => purchaseSavings('expense', '80', { originalPrice: '100', discount: '10' })).toThrow('different savings');
    expect(() => purchaseSavings('expense', '80', { originalPrice: '70' })).toThrow();
  });
  it.each(['-1', 'NaN', '1.234', '1e2'])('rejects invalid benefit %s', value => {
    expect(() => purchaseSavings('expense', '80', { discount: value })).toThrow();
    expect(() => purchaseSavings('expense', '80', { expected: value })).toThrow();
  });
  it('accepts zero and comma decimal amounts, rejects nonexpense benefits', () => {
    expect(purchaseSavings('EXPENSE', '-80', { discount: '0,00', expected: '2,50' })).toEqual({ discountAmount: '0.00', cashbackExpected: '2.50' });
    expect(() => purchaseSavings('income', '80', { discount: '2' })).toThrow();
  });
  it('excludes pending cashback from earned savings and settles via real receipts', () => {
    expect(savingsReport([purchase]).totals[0]).toMatchObject({ discount: 20, received: 0, pending: 5, total: 20 });
    expect(savingsReport([purchase, receipt, receipt]).totals[0]).toMatchObject({ discount: 20, received: 5, pending: 0, total: 25 });
    expect(purchase.amount).toBe('-80.00');
  });
  it('handles partial receipts, reversals and returned purchases without deleting receipts', () => {
    expect(savingsReport([purchase, { ...receipt, amount: '2' }]).totals[0]).toMatchObject({ total: 22, pending: 3 });
    const reversal = { ...receipt, id: 'reversal', type: 'expense', amount: '-3' };
    expect(savingsReport([{ ...purchase, discountAmount: '10', cashbackExpected: '2' }, receipt, reversal]).totals[0]).toMatchObject({ total: 12, received: 2, pending: 0 });
    expect(savingsReport([{ ...purchase, discountAmount: '0', cashbackExpected: '0' }, receipt]).totals[0]).toMatchObject({ total: 5, pending: 0 });
    expect(savingsReport([{ ...purchase, discountAmount: '0', cashbackExpected: '0' }, reversal]).totals[0]).toMatchObject({ total: -3, pending: 0 });
  });
  it('filters by purchase date/account/category, keeps later receipts, never mixes currencies', () => {
    const usd = { ...purchase, id: 'usd', currency: 'USD' };
    const rows = [purchase, receipt, usd];
    expect(savingsReport(rows).totals).toHaveLength(2);
    expect(savingsReport(rows, { from: '2026-01-01', to: '2026-01-31', accountId: 'a', categoryId: 'food' }).totals[0].total).toBe(25);
    expect(savingsReport(rows, { accountId: 'b' }).rows).toHaveLength(0);
    expect(savingsReport(rows, { from: '2026-02-01' }).rows).toHaveLength(0);
  });
  it('rejects double ownership, cycles, transfers, mixed currencies and savings on receipts', () => {
    for (const invalid of [{ ...receipt, cashbackForId: 'other' }, { ...receipt, id: purchase.id }, { ...receipt, currency: 'USD' }, { ...receipt, type: 'transfer' }, { ...receipt, discountAmount: '1' }])
      expect(() => assertCashbackLink(invalid, purchase)).toThrow();
    expect(() => assertCashbackLink(receipt, { ...purchase, cashbackForId: 'other' })).toThrow();
  });
  it('adds money in cents without accumulating floating point residue', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...purchase, id: `p${i}`, discountAmount: '0.10', cashbackExpected: '0' }));
    expect(savingsReport(rows).totals[0].total).toBe(100);
  });
  it('validates backup links regardless of row order and keeps older backups compatible', () => {
    expect(() => validateSavingsRecords([{ id: 'legacy' }])).not.toThrow();
    expect(() => validateSavingsRecords([receipt, purchase])).not.toThrow();
    expect(() => validateSavingsRecords([receipt])).toThrow();
    expect(() => validateSavingsRecords([{ ...purchase, discountAmount: '-1' }])).toThrow();
    expect(() => validateSavingsRecords([{ ...purchase, cashbackExpected: 'NaN' }])).toThrow();
    expect(() => validateSavingsRecords([{ ...receipt, currency: 'USD' }, purchase])).toThrow();
  });
});
