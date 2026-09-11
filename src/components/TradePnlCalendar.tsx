"use client";

import PanelFrame from "./PanelFrame";
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Money } from './PrivacyContext';
import type { TradeHistoryRow } from '@/lib/trading/filter';
import { dailyRealisedPnl, monthDays, shiftMonth } from '@/lib/trading/pnlCalendar';

export default function TradePnlCalendar({ rows, currency }: { rows: TradeHistoryRow[]; currency: string }) {
  const days = useMemo(() => dailyRealisedPnl(rows), [rows]);
  const latest = days.at(-1)?.date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const month = chosenMonth ?? latest;
  const visible = days.filter(d => d.date.startsWith(month));
  const byDate = new Map(visible.map(d => [d.date, d]));
  const selected = selectedDay ? byDate.get(selectedDay) : undefined;
  const pnl = visible.reduce((sum, d) => sum + d.pnl, 0);
  const changeMonth = (next: string) => { setChosenMonth(next); setSelectedDay(null); };
  const color = (value: number) => value > 0 ? 'var(--green)' : value < 0 ? 'var(--red)' : 'var(--muted)';

  return <PanelFrame title="Daily P&L calendar" persistKey="pnl-calendar" className="card p-4" data-testid="pnl-calendar">
    <p className="text-xs text-[var(--muted)] mt-2">Realised P&amp;L by closing day (UTC), before separately reported fees. Uses the filters above.</p>
    <div className="flex flex-wrap items-center justify-between gap-3 my-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn" aria-label="Previous month" onClick={() => changeMonth(shiftMonth(month, -1))}>‹</button>
        <label className="text-xs">Month <input aria-label="P&L month" type="month" className="input" value={month}
          onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) changeMonth(e.target.value); }} /></label>
        <button type="button" className="btn" aria-label="Next month" onClick={() => changeMonth(shiftMonth(month, 1))}>›</button>
        <button type="button" className="text-xs hover:underline" onClick={() => { setChosenMonth(null); setSelectedDay(null); }}>Latest trades</button>
      </div>
      <div className="text-sm"><span style={{ color: color(pnl) }}><Money value={pnl} currency={currency} /></span>
        <span className="text-xs text-[var(--muted)]"> · {visible.reduce((sum, d) => sum + d.trades.length, 0)} closed trades · {visible.length} trading days</span>
      </div>
    </div>
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Daily realised P&L for ${month}`}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="text-center text-xs text-[var(--muted)] py-1">{d}</div>)}
        {monthDays(month).map((date, index) => {
          if (!date) return <div key={`blank-${index}`} aria-hidden="true" />;
          const day = byDate.get(date);
          return <button type="button" key={date} disabled={!day} aria-label={`${date}, ${day?.trades.length ?? 0} closed trades`}
            aria-pressed={selectedDay === date} onClick={() => setSelectedDay(selectedDay === date ? null : date)}
            className="min-w-0 rounded border p-1 sm:p-2 min-h-20 text-left disabled:cursor-default focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            style={{ borderColor: selectedDay === date ? 'var(--accent)' : 'var(--border)', background: day ? 'var(--surface-2)' : 'transparent' }}>
            <time dateTime={date} className="block text-xs">{Number(date.slice(-2))}</time>
            {day ? <><div className="text-[10px] sm:text-xs break-words mt-2" style={{ color: color(day.pnl) }}><Money value={day.pnl} currency={currency} /></div>
              <div className="text-[10px] text-[var(--muted)]">{day.trades.length} trade{day.trades.length === 1 ? '' : 's'}</div></>
              : <span className="text-[10px] text-[var(--muted)]">—</span>}
          </button>;
        })}
      </div>
    </div>
    {visible.length === 0 && <p className="text-xs text-[var(--muted)] mt-3">No closed trades for this month and these filters.</p>}
    {selected && <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-sm font-medium">Trades closed on {selected.date}</h3>
      <ul className="mt-2 space-y-2">{selected.trades.map(t => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span><Link className="hover:underline" href={`/investments/asset/${encodeURIComponent(t.symbol!)}`}>{t.symbol}</Link> · {t.accountName} · {new Date(t.date).toISOString().slice(11, 19)} UTC</span>
        <span style={{ color: color(t.realizedPnl!) }}><Money value={t.realizedPnl!} currency={currency} /></span>
      </li>)}</ul>
    </div>}
  </PanelFrame>;
}
