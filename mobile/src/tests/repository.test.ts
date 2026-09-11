import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { LocalVault, type Persistence } from '../storage/repository';
import { migrations } from '../storage/migrations.generated';
import { account, stateWithAccounts } from './fixtures';
import { transfer, recordCash, deleteEvent } from '../domain/operations';
import { emptyState, type LocalEvent } from '../domain/model';

async function open() {
  const db = new DatabaseSync(':memory:');
  for (const sql of migrations) db.exec(sql);
  const persistence: Persistence = {
    async read() { return (db.prepare('SELECT payload FROM vault_state WHERE id=1').get() as { payload: string } | undefined)?.payload ?? null; },
    async write(json) { db.prepare('INSERT INTO vault_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(json); },
    async readSyncBase() {
      const row = db.prepare('SELECT version, payload FROM sync_base WHERE id=1').get() as { version: number; payload: string } | undefined;
      return row ? { version: row.version, json: row.payload } : null;
    },
    async writeWithSyncBase(json, base) {
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO vault_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(json);
        if (base === null) db.prepare('DELETE FROM sync_base WHERE id=1').run();
        else db.prepare('INSERT INTO sync_base(id,version,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload=excluded.payload').run(base.version, base.json);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    async close() { db.close(); },
  };
  return { db, persistence, vault: await LocalVault.open(persistence) };
}
function cash(accountId: string, amount: string): LocalEvent {
  return { id: randomUUID(), accountId, date: '2026-01-02T12:00:00.000Z', type: amount.startsWith('-') ? 'EXPENSE' : 'INCOME',
    amount, currency: 'EUR', description: '', symbol: '', quantity: null, price: null, fees: null, source: 'manual', externalId: '', transferId: null };
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
    const vault = await LocalVault.open({ read: async () => null, write: async () => { entered(); await writing; },
      readSyncBase: async () => null, writeWithSyncBase: async () => undefined, close: async () => undefined });
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

describe('the sync base beside the vault', () => {
  it('stores a sync result and its base together', async () => {
    const { vault } = await open(); const a = account();
    await vault.replace(stateWithAccounts(a));
    const expected = vault.snapshot();
    const next = structuredClone(expected); recordCash(next, cash(a.id, '5'));

    const result = await vault.applySync(expected, next, next, 4);
    expect(result.applied).toBe(true);
    expect(vault.snapshot().accounts[0].balance).toBe('105');
    const base = await vault.syncBase();
    expect(base?.version).toBe(4);
    expect(base?.state.accounts[0].balance).toBe('105');
    await vault.close();
  });

  it('sets a result aside when the state changed while the round ran', async () => {
    // The person recorded a movement during the network call. Applying the round's
    // result would erase it; setting it aside loses nothing, because the server
    // already has what was sent and the next round merges it with this edit.
    const { vault, persistence } = await open(); const a = account();
    await vault.replace(stateWithAccounts(a));
    const expected = vault.snapshot();
    await vault.update(s => recordCash(s, cash(a.id, '-3')));
    const before = await persistence.read();

    const result = await vault.applySync(expected, expected, expected, 2);
    expect(result.applied).toBe(false);
    expect(await persistence.read()).toBe(before);
    expect(await vault.syncBase()).toBeNull();
    expect(vault.snapshot().accounts[0].balance).toBe('97');
    await vault.close();
  });

  it('writes neither the state nor the base if the base cannot be written', async () => {
    const { vault, persistence, db } = await open(); const a = account();
    await vault.replace(stateWithAccounts(a));
    const expected = vault.snapshot();
    const before = await persistence.read();
    db.exec("CREATE TRIGGER base_full_disk BEFORE INSERT ON sync_base BEGIN SELECT RAISE(ABORT,'disk full'); END;");
    const next = structuredClone(expected); recordCash(next, cash(a.id, '5'));

    await expect(vault.applySync(expected, next, next, 1)).rejects.toThrow('disk full');
    expect(await persistence.read()).toBe(before);
    expect(await vault.syncBase()).toBeNull();
    expect(vault.snapshot().accounts[0].balance).toBe('100');
    await vault.close();
  });

  it('forgets the base in the same write as a restore', async () => {
    // Merged against the old base, a restored backup would read as deleting every
    // record it lacks — on every device on the account.
    const { vault } = await open(); const a = account();
    await vault.replace(stateWithAccounts(a));
    const synced = vault.snapshot();
    await vault.applySync(synced, synced, synced, 3);

    await vault.restore(emptyState());
    expect(await vault.syncBase()).toBeNull();
    expect(vault.snapshot().accounts).toHaveLength(0);
    await vault.close();
  });

  it('stops syncing without touching a single record', async () => {
    const { vault } = await open(); const a = account();
    await vault.replace(stateWithAccounts(a));
    const synced = vault.snapshot();
    await vault.applySync(synced, synced, synced, 3);

    await vault.forgetSync();
    expect(await vault.syncBase()).toBeNull();
    expect(vault.snapshot()).toEqual(synced);
    await vault.close();
  });
});
