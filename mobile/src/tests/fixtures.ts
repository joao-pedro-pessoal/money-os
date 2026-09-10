import { randomUUID } from 'node:crypto';
import { type LocalAccount, type LocalState, emptyState } from '../domain/model';
export function account(over: Partial<LocalAccount> = {}): LocalAccount {
  return { id: randomUUID(), name: 'Conta de teste', currency: 'EUR', balance: '100', platform: null,
    credentialRef: null, reading: null, syncedAt: null, createdAt: '2026-01-01T12:00:00.000Z', ...over };
}
export function stateWithAccounts(...accounts: LocalAccount[]): LocalState { return { ...emptyState(), accounts }; }
