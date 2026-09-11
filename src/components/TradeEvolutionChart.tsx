"use client";

import PanelFrame from "./PanelFrame";
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Money, usePrivacy } from './PrivacyContext';
import type { PnlPoint } from '@/lib/trading/stats';
import type { AccountEvolution } from '@/lib/trading/accountEvolution';

export default function TradeEvolutionChart({ pnl, currency, accounts, accountName, from, to, onAccount }: {
  pnl: PnlPoint[]; currency: string; accounts: AccountEvolution[]; accountName: string | null;
  from: string | null; to: string | null; onAccount: (name: string) => void;
}) {
  const [mode, setMode] = useState<'pnl' | 'account'>('pnl');
  const { hidden } = usePrivacy();
  const account = accountName ? accounts.find(a => a.name === accountName) : accounts.find(a => a.points.length > 0) ?? accounts[0];
  const balance = (account?.points ?? []).filter(p => (!from || p.date >= from) && (!to || p.date <= to));
  const data: { date: string; value?: number; realized?: number; fees?: number; net?: number }[] = mode === 'account' ? balance : pnl;
  const unit = mode === 'account' ? account?.currency ?? currency : currency;
  const last = pnl.at(-1);
  const money = (n: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: unit }).format(n);

  return <PanelFrame title="Account & P&L evolution" persistKey="trade-evolution" className="card p-4" data-testid="trade-evolution">
    <div className="flex flex-wrap gap-3 items-center my-3">
      <label className="text-xs">Line chart <select aria-label="Evolution chart" className="input ml-2" value={mode} onChange={e => setMode(e.target.value as 'pnl' | 'account')}>
        <option value="pnl">Cumulative P&amp;L</option><option value="account">Account value</option>
      </select></label>
      {mode === 'account' && <label className="text-xs">Account <select aria-label="Chart account" className="input ml-2" value={account?.id ?? ''}
        onChange={e => { const chosen = accounts.find(a => a.id === e.target.value); if (chosen) onAccount(chosen.name); }}>
        {!account && <option value="">No account selected</option>}
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
      </select></label>}
    </div>
    <p className="text-xs text-[var(--muted)] mb-3">{mode === 'pnl'
      ? 'Cumulative realised P&L and separately reported fees for the filtered trades, starting at zero in the selected period.'
      : 'Recorded account balance at the last observation of each UTC day, in the account currency. Includes deposits and withdrawals; changes are not trading profit. Account and date filters apply; instrument and tag filters do not change the account balance.'}</p>
    {mode === 'account' && account && <>
      {account.omitted > 0 && <p className="text-xs text-[var(--muted)]">{account.omitted} snapshots omitted because their currency or value could not be used.</p>}
      {account.assumedCurrency && <p className="text-xs text-[var(--muted)]">Older snapshots without a currency use the account&apos;s current currency.</p>}
      {balance.length > 0 && <p className="text-sm mb-3">Latest recorded: <Money value={balance.at(-1)!.value} currency={unit} /> · {balance.at(-1)!.date}</p>}
    </>}
    {mode === 'pnl' && last && <div className="flex flex-wrap gap-4 text-sm mb-3">
      <span>Realised: <Money value={last.realized} currency={currency} /></span>
      <span>Fees: <Money value={last.fees} currency={currency} /></span>
      <span>Net: <Money value={last.net} currency={currency} /></span>
    </div>}
    {hidden ? <p className="text-xs text-[var(--muted)] py-8">Chart hidden in privacy mode.</p>
      : data.length === 0 ? <p className="text-xs text-[var(--muted)] py-8">{mode === 'account' ? 'No account snapshots in this period. Sync the account to record its history.' : 'No closed trades match these filters.'}</p>
      : <div className="h-64 w-full" role="img" aria-label={mode === 'account' ? `Recorded balance evolution for ${account?.name}` : 'Cumulative realised P&L, fees and net result'}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={35} />
          <YAxis tick={{ fontSize: 10 }} width={55} />
          <Tooltip formatter={v => money(Number(v))} contentStyle={{ background: 'var(--surface)', borderColor: 'var(--border)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {mode === 'account' ? <Line type="linear" dataKey="value" name={`Account value (${unit})`} stroke="var(--accent)" dot={data.length === 1} isAnimationActive={false} />
            : <><Line type="linear" dataKey="realized" name="Realised P&L" stroke="var(--accent)" dot={data.length === 1} isAnimationActive={false} />
              <Line type="linear" dataKey="fees" name="Fees" stroke="var(--amber)" dot={data.length === 1} isAnimationActive={false} />
              <Line type="linear" dataKey="net" name="Net" stroke="var(--green)" dot={data.length === 1} isAnimationActive={false} /></>}
        </LineChart></ResponsiveContainer>
      </div>}
  </PanelFrame>;
}
