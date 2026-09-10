import { add, amountInput, measured, negate, positive, units } from './money';
import { Account, Event, Reading, type LocalAccount, type LocalEvent, type LocalState } from './model';
import type { NormalizedAccountState } from '../../../src/lib/connectors/types';
import { computeNetWorth } from '../../../src/lib/accounting/networth';
import { capitalAtRisk } from '../../../src/lib/connectors/margin';

export function addAccount(state: LocalState, account: LocalAccount): void {
  if (state.accounts.some(a => a.id === account.id)) throw new Error('A conta já existe.');
  state.accounts.push(Account.parse(account));
}
function manualAccount(state: LocalState, id: string): LocalAccount {
  const account = state.accounts.find(a => a.id === id);
  if (!account) throw new Error('Conta não encontrada.');
  if (account.platform) throw new Error('O saldo desta conta vem da corretora. Usa a sincronização.');
  return account;
}
export function recordCash(state: LocalState, row: LocalEvent): void {
  const account = manualAccount(state, row.accountId);
  if (!['INCOME', 'EXPENSE'].includes(row.type) || row.source !== 'manual' || row.currency !== account.currency)
    throw new Error('Movimento inválido.');
  if ((row.type === 'INCOME' && units(row.amount) <= 0n) || (row.type === 'EXPENSE' && units(row.amount) >= 0n))
    throw new Error('Sinal inválido no movimento.');
  if (state.events.some(e => e.id === row.id)) throw new Error('Movimento repetido.');
  state.events.push(Event.parse(row));
  account.balance = add(account.balance, row.amount);
}
export function transfer(state: LocalState, input: {
  from: string; to: string; sent: string; received: string; date: string;
  id: string; outgoingId: string; incomingId: string;
}): void {
  if (input.from === input.to) throw new Error('Escolhe duas contas diferentes.');
  const from = manualAccount(state, input.from);
  const to = manualAccount(state, input.to);
  const sent = positive(input.sent);
  const received = positive(input.received);
  if (from.currency === to.currency && sent !== received)
    throw new Error('Na mesma moeda os montantes devem coincidir. Regista as comissões como despesa.');
  const common = { date: input.date, type: 'TRANSFER' as const, description: `${from.name} → ${to.name}`,
    symbol: '', quantity: null, price: null, fees: null, source: 'manual' as const, externalId: '', transferId: input.id };
  state.events.push(Event.parse({ ...common, id: input.outgoingId, accountId: from.id, amount: negate(sent), currency: from.currency }));
  state.events.push(Event.parse({ ...common, id: input.incomingId, accountId: to.id, amount: received, currency: to.currency }));
  from.balance = add(from.balance, negate(sent));
  to.balance = add(to.balance, received);
}
export function deleteEvent(state: LocalState, id: string): void {
  const row = state.events.find(e => e.id === id);
  if (!row) return;
  if (row.source !== 'manual') throw new Error('O histórico importado ou sincronizado não altera saldos manualmente.');
  const removed = row.transferId ? state.events.filter(e => e.transferId === row.transferId) : [row];
  for (const event of removed) {
    const account = manualAccount(state, event.accountId);
    account.balance = add(account.balance, negate(event.amount));
  }
  const ids = new Set(removed.map(e => e.id));
  state.events = state.events.filter(e => !ids.has(e.id));
}
export function applyReading(state: LocalState, accountId: string, reading: NormalizedAccountState,
  now: string, newId: () => string): void {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account?.platform) throw new Error('A ligação já não existe.');
  const { activity, ...rest } = reading;
  const valid = Reading.parse({ ...rest, asOf: reading.asOf?.toISOString() ?? null });
  account.reading = valid;
  account.currency = valid.currency;
  account.syncedAt = now;
  const value = accountValue(account);
  if (value.amount !== null) state.snapshots.push({ id: newId(), accountId, date: now,
    currency: account.currency, value: value.amount, partial: value.partial });
  const existing = new Set(state.events.filter(e => e.accountId === accountId && e.source === 'sync').map(e => e.externalId));
  for (const row of activity ?? []) {
    if (!row.externalId || existing.has(row.externalId)) continue;
    const { realizedPnl: _realizedPnl, ...event } = row;
    state.events.push(Event.parse({ ...event, id: newId(), accountId, date: new Date(row.date).toISOString(),
      amount: measured(row.amount), source: 'sync', transferId: null }));
    existing.add(row.externalId);
  }
}
export function accountValue(account: LocalAccount): { amount: string | null; partial: boolean } {
  if (!account.platform) return { amount: amountInput(account.balance), partial: false };
  if (!account.reading) return { amount: null, partial: true };
  const r = account.reading;
  const outside = r.balances.filter(b => b.countsInPortfolio ?? r.balancesAreSeparatePool);
  const partial = ['binance', 'mexc', 'okx', 'kraken'].includes(account.platform) ||
    outside.some(b => b.usdValue === null && b.total !== 0);
  const separate = outside.reduce((sum, b) => b.usdValue === null ? sum : add(sum, measured(b.usdValue)), '0');
  // The same net-worth arbiter as the web app. Positions are already in equity.
  const total = computeNetWorth({ cash: r.equity, manualPortfolio: 0, syncedPortfolio: Number(separate),
    openPositionValue: r.totalNotionalPosition ?? 0, floatingPortfolio: Number(separate),
    insideBalances: [{ cash: r.equity, invested: r.positions.reduce((s, p) => s + capitalAtRisk(p).atRisk, 0) }] }).total;
  return { amount: measured(total), partial };
}
export function totalsByCurrency(state: LocalState): { currency: string; value: string; partial: boolean; missing: number }[] {
  const totals = new Map<string, { currency: string; value: string; partial: boolean; missing: number }>();
  for (const account of state.accounts) {
    const row = totals.get(account.currency) ?? { currency: account.currency, value: '0', partial: false, missing: 0 };
    const value = accountValue(account);
    if (value.amount !== null) row.value = add(row.value, value.amount);
    else row.missing++;
    row.partial ||= value.partial;
    totals.set(account.currency, row);
  }
  return [...totals.values()];
}
