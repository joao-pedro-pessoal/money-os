import { manualAmount } from './manualEntry';

export type SavingsFields = { discountAmount?: string | null; cashbackExpected?: string | null; cashbackForId?: string | null };
export type SavingsTransaction = SavingsFields & {
  id: string; type: string; amount: string; currency: string; date: string;
  accountId: string; categoryId?: string | null; description?: string | null;
};

function optionalAmount(value: string): string {
  if (!value.trim() || /^0+(?:[.,]0{1,2})?$/.test(value.trim())) return '0.00';
  return manualAmount(value);
}

/** Discounts describe an expense; they never become a second money movement. */
export function purchaseSavings(type: string, paid: string, input: {
  discount?: string; originalPrice?: string; expected?: string;
}): { discountAmount: string; cashbackExpected: string } {
  let discountAmount = optionalAmount(input.discount ?? '');
  const cashbackExpected = optionalAmount(input.expected ?? '');
  if (input.originalPrice?.trim()) {
    const difference = Math.round(Number(manualAmount(input.originalPrice)) * 100) - Math.round(Math.abs(Number(paid)) * 100);
    if (difference < 0) throw new Error('Original price must be at least the amount paid.');
    if (input.discount?.trim() && Math.round(Number(discountAmount) * 100) !== difference)
      throw new Error('Discount and original price describe different savings. Enter just one, or make them agree.');
    discountAmount = (difference / 100).toFixed(2);
  }
  if (type.toLowerCase() !== 'expense' && (Number(discountAmount) || Number(cashbackExpected)))
    throw new Error('Discounts and expected cashback belong to expenses only.');
  return { discountAmount, cashbackExpected };
}

/** A receipt/reversal has one owner. Linking it changes attribution, never its amount. */
export function assertCashbackLink(receipt: SavingsTransaction, purchase: SavingsTransaction) {
  if (receipt.id === purchase.id || purchase.type.toLowerCase() !== 'expense' || purchase.cashbackForId)
    throw new Error('Choose a purchase, not another cashback movement.');
  if (!['income', 'expense'].includes(receipt.type.toLowerCase()) ||
      (receipt.type.toLowerCase() === 'income' ? Number(receipt.amount) <= 0 : Number(receipt.amount) >= 0))
    throw new Error('Cashback needs an income receipt or an expense reversal.');
  if (receipt.currency !== purchase.currency) throw new Error('Choose a cashback movement in the purchase currency.');
  if (Number(receipt.discountAmount ?? 0) || Number(receipt.cashbackExpected ?? 0))
    throw new Error('A purchase with savings cannot also be a cashback receipt.');
  if (receipt.cashbackForId && receipt.cashbackForId !== purchase.id)
    throw new Error('This movement is already linked to another purchase. Unlink it first.');
}

export type SavingsFilter = { from?: string; to?: string; accountId?: string; categoryId?: string };
export type SavingsTotal = { currency: string; discount: number; received: number; pending: number; total: number };

/** Validate the new metadata before a web backup can replace any existing data. */
export function validateSavingsRecords(raw: unknown[]): void {
  const rows = raw.filter((t): t is Record<string, unknown> => !!t && typeof t === 'object');
  const byId = new Map(rows.map(t => [t.id, t]));
  const owners = new Set(rows.map(t => t.cashbackForId).filter(Boolean));
  const asTransaction = (row: Record<string, unknown>) => {
    if (typeof row.id !== 'string' || typeof row.type !== 'string' || typeof row.currency !== 'string' ||
        typeof row.amount !== 'string' || !Number.isFinite(Number(row.amount))) throw new Error('Invalid savings transaction.');
    return row as unknown as SavingsTransaction;
  };
  for (const row of rows) {
    if (row.discountAmount === undefined && row.cashbackExpected === undefined && !row.cashbackForId) continue;
    const tx = asTransaction(row);
    for (const value of [row.discountAmount, row.cashbackExpected]) {
      if (value !== undefined && (typeof value !== 'string' || !/^\d{1,12}(\.\d{1,2})?$/.test(value)))
        throw new Error('Invalid savings amount.');
    }
    purchaseSavings(tx.type, tx.amount, { discount: tx.discountAmount ?? '', expected: tx.cashbackExpected ?? '' });
    if (tx.cashbackForId) {
      const purchase = byId.get(tx.cashbackForId);
      if (!purchase || owners.has(tx.id)) throw new Error('Invalid cashback association.');
      assertCashbackLink(tx, asTransaction(purchase));
    }
  }
}

/** Purchase-cohort report: dates/accounts/categories filter purchases, receipts show lifetime settlement.
 * Keep currencies separate, and use integer cents for purchase benefits. Pending is never earned savings.
 */
export function savingsReport(transactions: SavingsTransaction[], filter: SavingsFilter = {}) {
  const unique = [...new Map(transactions.map(t => [t.id, t])).values()];
  const receipts = new Map<string, SavingsTransaction[]>();
  for (const tx of unique) if (tx.cashbackForId) {
    const group = receipts.get(tx.cashbackForId) ?? [];
    group.push(tx); receipts.set(tx.cashbackForId, group);
  }
  const totals = new Map<string, SavingsTotal>();
  const rows = unique.filter(t => t.type.toLowerCase() === 'expense' && !t.cashbackForId &&
    (Number(t.discountAmount ?? 0) !== 0 || Number(t.cashbackExpected ?? 0) !== 0 || receipts.has(t.id)) &&
    (!filter.from || t.date.slice(0, 10) >= filter.from) && (!filter.to || t.date.slice(0, 10) <= filter.to) &&
    (!filter.accountId || t.accountId === filter.accountId) && (!filter.categoryId || t.categoryId === filter.categoryId)
  ).map(purchase => {
    const linked = receipts.get(purchase.id) ?? [];
    for (const receipt of linked) assertCashbackLink(receipt, purchase);
    const discount = Math.round(Number(purchase.discountAmount ?? 0) * 100);
    const received = linked.reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0);
    const pending = Math.max(0, Math.round(Number(purchase.cashbackExpected ?? 0) * 100) - Math.max(0, received));
    const total = totals.get(purchase.currency) ?? { currency: purchase.currency, discount: 0, received: 0, pending: 0, total: 0 };
    total.discount += discount; total.received += received; total.pending += pending; total.total += discount + received;
    totals.set(purchase.currency, total);
    return { purchase, receipts: linked, discount: discount / 100, received: received / 100, pending: pending / 100, total: (discount + received) / 100 };
  }).sort((a, b) => b.purchase.date.localeCompare(a.purchase.date));
  return { rows, totals: [...totals.values()].map(t => ({ ...t, discount: t.discount / 100, received: t.received / 100, pending: t.pending / 100, total: t.total / 100 })) };
}
