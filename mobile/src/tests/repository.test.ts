import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { LocalVault, type Persistence } from '../storage/repository';
import { migrations } from '../storage/migrations.generated';
import { account, stateWithAccounts } from './fixtures';
import { transfer, recordCash, deleteEvent } from '../domain/operations';
import { emptyState } from '../domain/model';

async function open() {
  const db = new DatabaseSync(':memory:');
  for (const sql of migrations) db.exec(sql);
  const persistence: Persistence = {
    async read() { return (db.prepare('SELECT payload FROM vault_state WHERE id=1').get() as { payload: string } | undefined)?.payload ?? null; },
    async write(json) { db.prepare('INSERT INTO vault_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(json); },
    async close() { db.close(); },
  };
  return { db, persistence, vault: await LocalVault.open(persistence) };
}
describe('atomic local vault with real SQLite', () => {
  it('keeps both transfer amounts in their own currencies; undo restores both balances', async () => {
    const { vault } = await open();
    const from = account(), to = account({ currency: 'USD', balance: '20' });
    await vault.replace(stateWithAccounts(from, to));
    const outgoingId = randomUUID();
    await vault.update(state => transfer(state, { from: from.id, to: to.id, sent: '10.10', received: '11.25',
      date: '2026-01-02T12:00:00.000Z', id: randomUUID(), outgoingId, incomingId: randomUUID() }));
    expect(vault.snapshot().accounts.map(a => a.balance)).toEqual(['89.9', '31.25']);
    expect(vault.snapshot().events.map(e => e.currency)).toEqual(['EUR', 'USD']);
    await vault.update(s => deleteEvent(s, outgoingId));
    expect(vault.snapshot().accounts.map(a => a.balance)).toEqual(['100', '20']);
    expect(vault.snapshot().events).toHaveLength(0);
    await vault.close();
  });
  it('does not persist either leg if an operation throws between mutations', async () => {
    const { vault, persistence } = await open();
    await vault.replace(stateWithAccounts(account()));
    const before = await persistence.read();
    await expect(vault.update(s => { s.accounts[0].balance = '-999'; throw new Error('interrupted'); })).rejects.toThrow('interrupted');
    expect(await persistence.read()).toEqual(before);
    expect(vault.snapshot().accounts[0].balance).toBe('100');
    await vault.close();
  });
  it('retains the entire old backup if SQLite rejects a replacement', async () => {
    const { vault, persistence, db } = await open();
    await vault.replace(stateWithAccounts(account()));
    const before = await persistence.read();
    db.exec("CREATE TRIGGER simulate_full_disk BEFORE UPDATE ON vault_state BEGIN SELECT RAISE(ABORT,'disk full'); END;");
    await expect(vault.replace(emptyState())).rejects.toThrow('disk full');
    expect(await persistence.read()).toEqual(before);
    expect(vault.snapshot().accounts).toHaveLength(1);
    await vault.close();
  });
  it('serializes concurrent updates without losing money', async () => {
    const { vault } = await open(); const a = account();
    await vault.replace(stateWithAccounts(a));
    await Promise.all(Array.from({ length: 50 }, () => vault.update(s => recordCash(s, {
      id: randomUUID(), accountId: a.id, date: '2026-01-02T12:00:00.000Z', type: 'INCOME', amount: '0.01', currency: 'EUR',
      description: '', symbol: '', quantity: null, price: null, fees: null, source: 'manual', externalId: '', transferId: null,
    }))));
    expect(vault.snapshot().accounts[0].balance).toBe('100.5');
    expect(vault.snapshot().events).toHaveLength(50);
    await vault.close();
  });
  it('rejects a missing transfer destination before changing balances', async () => {
    const { vault } = await open(); const a = account(); await vault.replace(stateWithAccounts(a));
    await expect(vault.update(s => transfer(s, { from: a.id, to: randomUUID(), sent: '10', received: '10',
      date: '2026-01-02T12:00:00.000Z', id: randomUUID(), outgoingId: randomUUID(), incomingId: randomUUID() }))).rejects.toThrow();
    expect(vault.snapshot().accounts[0].balance).toBe('100');
    await vault.close();
  });
  it('refuses writes and reading financial state after locking', async () => {
    const { vault } = await open(); await vault.close();
    await expect(vault.replace(emptyState())).rejects.toThrow('bloqueada');
    expect(() => vault.snapshot()).toThrow('bloqueada');
  });
  it('does not report a committed write as failed when locking during persistence', async () => {
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const writing = new Promise<void>(resolve => { finish = resolve; });
    const vault = await LocalVault.open({ read: async () => null, write: async () => { entered(); await writing; }, close: async () => undefined });
    const pending = vault.replace(stateWithAccounts(account()));
    await started;
    const closing = vault.close();
    finish();
    expect((await pending).accounts).toHaveLength(1);
    await closing;
    expect(() => vault.snapshot()).toThrow('bloqueada');
  });
  it('rejects incomplete restored transfers without touching saved data', async () => {
    const { vault, persistence } = await open(); const a = account(); await vault.replace(stateWithAccounts(a));
    const before = await persistence.read();
    await expect(vault.update(s => { s.events.push({ id: randomUUID(), accountId: a.id,
      type: 'TRANSFER', amount: '-10', currency: 'EUR', source: 'manual', transferId: randomUUID(),
      date: '2026-01-01T12:00:00.000Z', symbol: '', quantity: null, price: null, fees: null, externalId: '', description: '' }); })).rejects.toThrow('inválidos');
    expect(await persistence.read()).toBe(before); await vault.close();
  });
});
