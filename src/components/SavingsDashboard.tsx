"use client";

import { useActionState, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { getSavingsData, linkCashback, recordCashback, unlinkCashback, updatePurchaseSavings } from '@/actions/savings';
import { savingsReport } from '@/lib/money/savings';
import PurchaseSavingsFields from './PurchaseSavingsFields';
import PanelFrame from './PanelFrame';
import { newQuickEntryId } from '@/lib/money/quickEntryId';
import { Money, usePrivacy } from './PrivacyContext';

type Data = Awaited<ReturnType<typeof getSavingsData>>;
type FormProps = { action: (form: FormData) => Promise<void>; children: ReactNode; label: string; once?: boolean };
function ActionForm(props: FormProps) {
  const [attempt, setAttempt] = useState(0);
  return <ActionAttempt key={attempt} {...props} restart={() => setAttempt(n => n + 1)} />;
}
function ActionAttempt({ action, children, label, once, restart }: FormProps & { restart: () => void }) {
  const request = useRef('');
  const [result, submit, pending] = useActionState<{ error?: string; saved?: boolean }, FormData>(async (_, form) => {
    request.current ||= newQuickEntryId();
    form.set('requestId', request.current);
    try { await action(form); return { saved: true }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'Could not save. Retry with the same details.' }; }
  }, {});
  return <form action={submit} className="space-y-3"><fieldset disabled={pending || (once && result.saved)} className="space-y-3">
    {children}<button className="btn" type="submit">{pending ? 'Saving…' : label}</button>
  </fieldset>{result.error && <p role="alert" className="text-sm text-[var(--red)]">{result.error}</p>}
    {result.saved && <p role="status" className="text-sm">Saved.</p>}
    {once && result.saved && <button type="button" className="btn" onClick={restart}>Record another movement</button>}</form>;
}

export default function SavingsDashboard({ data, initialPurchase = '' }: { data: Data; initialPurchase?: string }) {
  const { hidden } = usePrivacy();
  const [period, setPeriod] = useState('all');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [accountId, setAccountId] = useState(''), [categoryId, setCategoryId] = useState('');
  const [selected, setSelected] = useState(initialPurchase);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(30);
  const range = period === 'month' ? { from: `${month}-01`, to: `${month}-31` }
    : period === 'year' ? { from: `${year}-01-01`, to: `${year}-12-31` } : period === 'custom' ? { from, to } : {};
  const rangeFrom = range.from, rangeTo = range.to;
  const report = useMemo(() => savingsReport(data.transactions, { from: rangeFrom, to: rangeTo, accountId, categoryId }), [data.transactions, rangeFrom, rangeTo, accountId, categoryId]);
  const purchases = data.transactions.filter(t => t.type === 'expense' && !t.cashbackForId);
  const purchase = purchases.find(t => t.id === selected);
  const labels = new Map(data.accounts.map(a => [a.id, a.name]));
  const label = (t: Data['transactions'][number]) => `${t.date.slice(0, 10)} · ${t.description || t.type} · ${labels.get(t.accountId) ?? 'Account'}${hidden ? '' : ` · ${t.amount} ${t.currency}`}`;
  const linkedPurchaseIds = new Set(data.transactions.map(t => t.cashbackForId).filter(Boolean));
  const receipts = purchase ? data.transactions.filter(t => t.id !== purchase.id && !t.cashbackForId && t.currency === purchase.currency &&
    !Number(t.discountAmount) && !Number(t.cashbackExpected) && !linkedPurchaseIds.has(t.id)) : [];
  const linked = purchase ? data.transactions.filter(t => t.cashbackForId === purchase.id) : [];
  return <div className="space-y-6">
    <PanelFrame persistKey="savings-filters" title="Filters" className="card p-4">
      <div className="flex flex-wrap gap-3 mt-3">
        <label className="text-sm">Purchase period<select aria-label="Purchase period" className="input" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">All time</option><option value="month">Month</option><option value="year">Year</option><option value="custom">Custom</option>
        </select></label>
        {period === 'month' && <label>Month<input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>}
        {period === 'year' && <label>Year<input className="input" type="number" min="1900" max="9999" value={year} onChange={e => setYear(e.target.value)} /></label>}
        {period === 'custom' && <><label>From<input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} /></label></>}
        <label className="text-sm">Purchase account<select aria-label="Purchase account" className="input" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">All accounts</option>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className="text-sm">Category<select aria-label="Category" className="input" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">All categories</option>{data.categories.filter(c => c.kind === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <p className="text-xs text-[var(--muted)] mt-3">Filters select purchases. Cashback includes all receipts and reversals linked to those purchases, even if received later. Currencies are kept separate.</p>
    </PanelFrame>
    {report.totals.map(t => <PanelFrame key={t.currency} persistKey={`savings-${t.currency}`} essential title={`Savings · ${t.currency}`} className="card p-4">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">{[['Discounts', t.discount], ['Cashback received (net)', t.received], ['Total saved', t.total], ['Cashback pending', t.pending]].map(([name, value]) => <div key={name}><dt className="text-xs text-[var(--muted)]">{name}</dt><dd className="text-lg"><Money value={Number(value)} currency={t.currency} /></dd></div>)}</dl>
    </PanelFrame>)}
    <PanelFrame persistKey="savings-history" essential title="Purchase savings history" className="card p-4">
      {!report.rows.length && <p className="text-sm mt-3">No savings recorded for these filters. Select a purchase below to add a discount or cashback.</p>}
      <div className="divide-y divide-[var(--border)]">{report.rows.slice(0, visible).map(row => <div key={row.purchase.id} className="py-4 space-y-2">
        <button type="button" className="text-left underline" onClick={() => setSelected(row.purchase.id)}>{row.purchase.description || 'Purchase'} · {row.purchase.date.slice(0, 10)}</button>
        <p className="text-xs text-[var(--muted)]">{labels.get(row.purchase.accountId)} · Paid <Money value={Math.abs(Number(row.purchase.amount))} currency={row.purchase.currency} /></p>
        <p className="text-sm">Saved <Money value={row.total} currency={row.purchase.currency} /> · discount <Money value={row.discount} currency={row.purchase.currency} /> · cashback <Money value={row.received} currency={row.purchase.currency} /> · pending <Money value={row.pending} currency={row.purchase.currency} /></p>
      </div>)}</div>
      {report.rows.length > visible && <button type="button" className="btn" onClick={() => setVisible(v => v + 30)}>Show more</button>}
    </PanelFrame>
    <PanelFrame persistKey="savings-edit" essential={Boolean(initialPurchase)} title="Add or edit purchase savings" className="card p-4">
      <div className="space-y-3 mt-3">
        <label className="block text-sm">Find purchase<input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Description, date or account" /></label>
        <label className="block text-sm">Purchase<select aria-label="Purchase" className="input" value={purchase?.id ?? ''} onChange={e => setSelected(e.target.value)}><option value="">Choose a purchase</option>{purchases.filter(t => t.id === selected || label(t).toLowerCase().includes(search.toLowerCase())).map(t => <option key={t.id} value={t.id}>{label(t)}</option>)}</select></label>
        {purchase && <div key={purchase.id} className="space-y-6">
          <ActionForm key={`${purchase.id}:${purchase.discountAmount}:${purchase.cashbackExpected}`} action={updatePurchaseSavings} label="Save purchase savings">
            <input type="hidden" name="id" value={purchase.id} />
            <PurchaseSavingsFields discountAmount={purchase.discountAmount} cashbackExpected={purchase.cashbackExpected} />
          </ActionForm>
          <p className="text-xs text-[var(--muted)]">Cancelled or fully returned purchase: set discount and expected cashback to zero. For a partial return, keep only the remaining benefit. Actual receipts stay in the history.</p>
          <details className="space-y-3"><summary className="cursor-pointer">Link cashback already in Cash Flow</summary>
            <p className="text-xs text-[var(--muted)]">Link an income receipt, or an expense if cashback was taken back. This uses the entire movement and does not change balances. One movement can belong to one purchase, in the same currency.</p>
            <ActionForm action={linkCashback} label="Link existing movement"><input type="hidden" name="purchaseId" value={purchase.id} />
              <label className="block text-sm">Cashback movement<select aria-label="Cashback movement" className="input" name="receiptId" required defaultValue=""><option value="">Choose receipt / reversal</option>{receipts.map(t => <option key={t.id} value={t.id}>{label(t)}</option>)}</select></label>
            </ActionForm>
          </details>
          <details className="space-y-3"><summary className="cursor-pointer">Record cashback not yet in Cash Flow</summary>
            <p className="text-xs text-[var(--muted)]">Only use this if the receipt is absent from your history. This creates a real income or expense and updates the selected account balance.</p>
            <ActionForm action={recordCashback} label="Record cashback movement" once>
              <input type="hidden" name="cashbackForId" value={purchase.id} /><input type="hidden" name="description" value={`Cashback · ${purchase.description || purchase.date.slice(0, 10)}`} />
              <label className="block text-sm">Movement<select aria-label="Movement" name="type" className="input"><option value="income">Received</option><option value="expense">Reversed / taken back</option></select></label>
              <label className="block text-sm">Receipt account<select aria-label="Receipt account" name="accountId" className="input" required defaultValue={purchase.accountId}>{data.accounts.filter(a => a.active && a.currency === purchase.currency).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
              <label className="block text-sm">Amount ({purchase.currency})<input name="amount" className="input" inputMode="decimal" required /></label>
              <label className="block text-sm">Receipt date<input name="date" className="input" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
            </ActionForm>
          </details>
          {linked.map(receipt => <div key={receipt.id} className="border-t border-[var(--border)] pt-3 space-y-2">
            <p>{label(receipt)}</p><Link href={`/transactions/${encodeURIComponent(receipt.id)}/edit`} className="underline text-sm">Edit receipt</Link>
            <ActionForm action={unlinkCashback} label="Unlink (keep money movement)"><input type="hidden" name="receiptId" value={receipt.id} /><input type="hidden" name="purchaseId" value={purchase.id} /></ActionForm>
          </div>)}
        </div>}
      </div>
    </PanelFrame>
  </div>;
}
