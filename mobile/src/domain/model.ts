import { z } from 'zod';
import { units } from './money';

export const Platform = z.enum(['hyperliquid', 'trading212', 'bybit', 'binance', 'kraken', 'okx', 'mexc']);
export type PlatformId = z.infer<typeof Platform>;
const id = z.string().uuid();
const amount = z.string().refine(v => { try { units(v); return true; } catch { return false; } }, 'Montante inválido');
const currency = z.string().regex(/^[A-Z]{3,8}$/);
const date = z.iso.datetime();
const finite = z.number().finite();
const nullable = finite.nullable();
const Position = z.object({
  coin: z.string(), side: z.enum(['long', 'short']), size: finite,
  entryPrice: nullable, markPrice: nullable, positionValue: nullable,
  unrealizedPnl: nullable, returnOnEquity: nullable, leverage: nullable,
  leverageType: z.string().nullable(), liquidationPrice: nullable, marginUsed: nullable,
  cumFunding: nullable, assetClass: z.string().nullable(), instrumentName: z.string().nullable().optional(),
});
const Balance = z.object({
  coin: z.string(), total: finite, hold: finite, price: nullable, usdValue: nullable,
  costBasis: nullable, countsInPortfolio: z.boolean().optional(),
});
export const Reading = z.object({
  currency, equity: finite, withdrawable: nullable, totalMarginUsed: nullable,
  totalNotionalPosition: nullable, realizedPnl: nullable.optional(), asOf: date.nullable(),
  positions: z.array(Position), balances: z.array(Balance), spotValue: finite,
  balancesAreSeparatePool: z.boolean(),
}).strict();
export const Account = z.object({
  id, name: z.string().trim().min(1).max(80), currency,
  // Manual balances include the investments in that account, if any.
  balance: amount, platform: Platform.nullable(), credentialRef: id.nullable(), reading: Reading.nullable(),
  syncedAt: date.nullable(), createdAt: date,
}).strict();
export type LocalAccount = z.infer<typeof Account>;
export const Event = z.object({
  id, accountId: id, date,
  type: z.enum(['BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'DEPOSIT', 'WITHDRAWAL', 'EXPENSE', 'INCOME', 'TAX', 'TRANSFER', 'OTHER']),
  amount, currency, description: z.string().max(2000), symbol: z.string().max(100),
  quantity: nullable, price: nullable, fees: nullable,
  source: z.enum(['manual', 'csv', 'sync']), externalId: z.string().max(1000),
  transferId: id.nullable(),
}).strict();
export type LocalEvent = z.infer<typeof Event>;
export const Goal = z.object({ id, name: z.string().min(1).max(80), currency, target: amount, saved: amount }).strict();
export const Commitment = z.object({ id, name: z.string().min(1).max(80), currency, amount, period: z.enum(['monthly', 'yearly']) }).strict();
export const Snapshot = z.object({ id, accountId: id, date, currency, value: amount, partial: z.boolean() }).strict();
export const StateSchema = z.object({
  version: z.literal(1),
  accounts: z.array(Account).max(500), events: z.array(Event).max(100000),
  snapshots: z.array(Snapshot).max(100000), goals: z.array(Goal).max(1000),
  commitments: z.array(Commitment).max(1000),
}).strict().superRefine((state, ctx) => {
  const accounts = new Map(state.accounts.map(a => [a.id, a]));
  for (const [name, rows] of Object.entries(state)) {
    if (Array.isArray(rows) && new Set(rows.map(r => r.id)).size !== rows.length)
      ctx.addIssue({ code: 'custom', message: `Identificadores repetidos: ${name}` });
  }
  for (const row of [...state.events, ...state.snapshots]) {
    if (!accounts.has(row.accountId)) ctx.addIssue({ code: 'custom', message: 'Registo sem conta.' });
  }
  for (const account of state.accounts) {
    if (!account.platform && account.reading) ctx.addIssue({ code: 'custom', message: 'Leitura numa conta manual.' });
    if (account.reading && account.reading.currency !== account.currency) ctx.addIssue({ code: 'custom', message: 'Moeda inconsistente na conta.' });
  }
  const transfers = new Map<string, LocalEvent[]>();
  for (const row of state.events) {
    if (['BUY', 'SELL'].includes(row.type) && (!row.symbol || row.quantity === null || row.quantity <= 0))
      ctx.addIssue({ code: 'custom', message: 'Compra ou venda sem quantidade positiva e instrumento.' });
    if (row.source === 'manual' && row.currency !== accounts.get(row.accountId)?.currency)
      ctx.addIssue({ code: 'custom', message: 'Moeda inconsistente no movimento.' });
    if (row.transferId) transfers.set(row.transferId, [...(transfers.get(row.transferId) ?? []), row]);
  }
  for (const rows of transfers.values()) {
    if (rows.length !== 2 || rows[0].accountId === rows[1].accountId ||
        rows.some(r => r.type !== 'TRANSFER' || r.source !== 'manual') ||
        units(rows[0].amount) * units(rows[1].amount) >= 0n)
      ctx.addIssue({ code: 'custom', message: 'Transferência incompleta.' });
  }
  for (const goal of state.goals) {
    if (units(goal.target) <= 0n || units(goal.saved) < 0n)
      ctx.addIssue({ code: 'custom', message: 'Objetivo inválido.' });
  }
  for (const item of state.commitments) if (units(item.amount) <= 0n)
    ctx.addIssue({ code: 'custom', message: 'Subscrição inválida.' });
});
export type LocalState = z.infer<typeof StateSchema>;
export function emptyState(): LocalState {
  return { version: 1, accounts: [], events: [], snapshots: [], goals: [], commitments: [] };
}
export function validateState(value: unknown): LocalState {
  const result = StateSchema.safeParse(value);
  if (!result.success) throw new Error('Dados inválidos ou incompatíveis. Nada foi substituído.');
  return result.data;
}
