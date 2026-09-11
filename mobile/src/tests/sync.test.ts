import { describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { decryptVault, encryptVault } from '../../../src/lib/vault/cipher';
import { generateSeed, seedEntropy } from '../../../src/lib/vault/seed';
import { syncVault, type StoredVault, type SyncInput, type SyncOutcome, type SyncTransport } from '../domain/sync';
import { recordCash, transfer } from '../domain/operations';
import { emptyState, validateState, type LocalEvent, type LocalState } from '../domain/model';
import { units } from '../domain/money';
import { account } from './fixtures';

const random = (n: number) => new Uint8Array(randomBytes(n));
const userId = 'user_1';
const clone = (s: LocalState): LocalState => structuredClone(s);

function cash(accountId: string, amount: string): LocalEvent {
  return {
    id: randomUUID(), accountId, date: '2026-02-01T12:00:00.000Z',
    type: units(amount) < 0n ? 'EXPENSE' : 'INCOME', amount, currency: 'EUR',
    description: '', symbol: '', quantity: null, price: null, fees: null,
    source: 'manual', externalId: '', transferId: null,
  };
}

/** An in-memory server that accepts a version only on top of the one it expects. */
function server() {
  const stored: StoredVault[] = [];
  let beforeNextPut: (() => Promise<void>) | null = null;
  const transport: SyncTransport = {
    async latest() { return stored.at(-1) ?? null; },
    async put(vault, expected) {
      if (beforeNextPut) { const hook = beforeNextPut; beforeNextPut = null; await hook(); }
      if ((stored.at(-1)?.vaultVersion ?? 0) !== expected) return false;
      if (vault.vaultVersion !== expected + 1) throw new Error('a send must be the expected version plus one');
      stored.push(vault);
      return true;
    },
  };
  return { transport, stored, beforeNextPut: (hook: () => Promise<void>) => { beforeNextPut = hook; } };
}

interface Device { base: LocalState; baseVersion: number; local: LocalState }
const fresh = (local: LocalState = emptyState()): Device => ({ base: emptyState(), baseVersion: 0, local });

async function sync(device: Device, entropy: Uint8Array, transport: SyncTransport, over: Partial<SyncInput> = {}) {
  const outcome = await syncVault({
    userId, entropy, baseVersion: device.baseVersion, base: device.base, local: device.local, transport, random, ...over,
  });
  if ('local' in outcome) {
    device.local = validateState(outcome.local);
    device.base = outcome.base;
    device.baseVersion = outcome.version;
  }
  return outcome;
}

function stateOnServer(stored: StoredVault, entropy: Uint8Array): LocalState {
  const { plaintext } = decryptVault({ text: stored.text, entropy, userId, minVaultVersion: 0 });
  return JSON.parse(new TextDecoder().decode(plaintext));
}

const balance = (d: Device, id: string) => d.local.accounts.find(a => a.id === id)!.balance;
const reason = (o: SyncOutcome) => (o.status === 'refused' ? o.reason : o.status);

async function twoPhones() {
  const entropy = seedEntropy(await generateSeed(random));
  const s = server();
  const a = account({ balance: '100' });
  const phoneA = fresh({ ...emptyState(), accounts: [a] });
  await sync(phoneA, entropy, s.transport);
  const phoneB = fresh();
  await sync(phoneB, entropy, s.transport);
  return { entropy, s, a, phoneA, phoneB };
}

describe('synchronising a vault between devices', () => {
  it('sends the first vault, and a new device receives it', async () => {
    const { s, a, phoneB } = await twoPhones();
    expect(s.stored.map(v => v.vaultVersion)).toEqual([1]);
    expect(phoneB.baseVersion).toBe(1);
    expect(balance(phoneB, a.id)).toBe('100');
  });

  it('does nothing when neither side changed', async () => {
    const { entropy, s, phoneA } = await twoPhones();
    const outcome = await sync(phoneA, entropy, s.transport);
    expect(outcome.status).toBe('up-to-date');
    expect(s.stored).toHaveLength(1);
  });

  it('merges a movement from each phone, and the balance counts both', async () => {
    const { entropy, s, a, phoneA, phoneB } = await twoPhones();
    recordCash(phoneA.local, cash(a.id, '50'));
    expect((await sync(phoneA, entropy, s.transport)).status).toBe('pushed');

    recordCash(phoneB.local, cash(a.id, '-20'));
    const outcome = await sync(phoneB, entropy, s.transport);
    expect(outcome.status).toBe('merged');
    expect(balance(phoneB, a.id)).toBe('130');

    expect((await sync(phoneA, entropy, s.transport)).status).toBe('pulled');
    expect(balance(phoneA, a.id)).toBe('130');
    expect(s.stored.map(v => v.vaultVersion)).toEqual([1, 2, 3]);
  });

  it('starts again when another phone writes between the read and the send', async () => {
    const { entropy, s, a, phoneA, phoneB } = await twoPhones();
    recordCash(phoneB.local, cash(a.id, '-20'));
    // While B is sending, A records and sends first. B's send must fail, not overwrite.
    s.beforeNextPut(async () => {
      recordCash(phoneA.local, cash(a.id, '50'));
      await sync(phoneA, entropy, s.transport);
    });

    const outcome = await sync(phoneB, entropy, s.transport);
    expect(outcome.status).toBe('merged');
    expect(balance(phoneB, a.id)).toBe('130');
    expect(s.stored.map(v => v.vaultVersion)).toEqual([1, 2, 3]);
  });

  it('gives up without losing anything when another device always writes first', async () => {
    const { entropy, s, a, phoneB } = await twoPhones();
    recordCash(phoneB.local, cash(a.id, '-20'));
    const blocked: SyncTransport = { latest: s.transport.latest, put: async () => false };

    const outcome = await sync(phoneB, entropy, blocked);
    expect(reason(outcome)).toBe('busy');
    expect(balance(phoneB, a.id)).toBe('80');
  });

  describe('against a server that is not trusted', () => {
    it('refuses to write over a server that went backwards', async () => {
      const { entropy, s, a, phoneA } = await twoPhones();
      recordCash(phoneA.local, cash(a.id, '50'));
      await sync(phoneA, entropy, s.transport);
      s.stored.pop();
      recordCash(phoneA.local, cash(a.id, '5'));

      const outcome = await sync(phoneA, entropy, s.transport);
      expect(reason(outcome)).toBe('server-behind');
      expect(s.stored.map(v => v.vaultVersion)).toEqual([1]);
    });

    it('refuses an old vault presented under a new version number', async () => {
      const { entropy, s, a, phoneA, phoneB } = await twoPhones();
      recordCash(phoneA.local, cash(a.id, '50'));
      await sync(phoneA, entropy, s.transport);
      const relabelled: SyncTransport = {
        latest: async () => ({ vaultVersion: 2, text: s.stored[0].text }),
        put: s.transport.put,
      };

      const outcome = await sync(phoneB, entropy, relabelled);
      expect(reason(outcome)).toBe('unreadable');
      expect(balance(phoneB, a.id)).toBe('100');
    });

    it('refuses a vault sealed under another seed', async () => {
      const { s, phoneB } = await twoPhones();
      const other = seedEntropy(await generateSeed(random));
      const stranger: SyncTransport = {
        latest: async () => ({ vaultVersion: 2, text: await encryptVault({
          plaintext: new TextEncoder().encode(JSON.stringify(emptyState())), entropy: other, userId, vaultVersion: 2, random,
        }) }),
        put: s.transport.put,
      };

      const outcome = await sync(phoneB, seedEntropy(await generateSeed(random)), stranger);
      expect(reason(outcome)).toBe('unreadable');
    });
  });

  it('refuses to send a merge that would not be a valid vault', async () => {
    // Each side is valid alone: this phone moved a manual account to USD, the
    // other moved it to GBP and recorded a movement in GBP. The merge keeps this
    // phone's currency and the other's movement, which no vault may hold.
    const { entropy, s, a, phoneA, phoneB } = await twoPhones();
    phoneA.local.accounts[0].currency = 'GBP';
    phoneA.local.events.push({ ...cash(a.id, '10'), currency: 'GBP' });
    phoneA.local.accounts[0].balance = '110';
    await sync(phoneA, entropy, s.transport);

    phoneB.local.accounts[0].currency = 'USD';
    const before = clone(phoneB.local);
    const outcome = await sync(phoneB, entropy, s.transport);

    expect(reason(outcome)).toBe('invalid-merge');
    expect(s.stored.map(v => v.vaultVersion)).toEqual([1, 2]);
    expect(phoneB.local).toEqual(before);
  });

  describe('key references', () => {
    it('never leave the device, even encrypted', async () => {
      const entropy = seedEntropy(await generateSeed(random));
      const s = server();
      const hl = account({ platform: 'hyperliquid', balance: '0', currency: 'USD', credentialRef: randomUUID() });
      await sync(fresh({ ...emptyState(), accounts: [hl] }), entropy, s.transport);

      expect(stateOnServer(s.stored[0], entropy).accounts[0].credentialRef).toBeNull();
    });

    it('stay on the device that owns them when it receives a newer vault', async () => {
      const entropy = seedEntropy(await generateSeed(random));
      const s = server();
      const hl = account({ platform: 'hyperliquid', balance: '0', currency: 'USD' });
      const phoneA = fresh({ ...emptyState(), accounts: [hl] });
      await sync(phoneA, entropy, s.transport);
      const phoneB = fresh();
      await sync(phoneB, entropy, s.transport);

      const mine = randomUUID();
      phoneB.local.accounts[0].credentialRef = mine;
      // A key of its own is not a change to send.
      expect((await sync(phoneB, entropy, s.transport)).status).toBe('up-to-date');

      phoneA.local.goals.push({ id: randomUUID(), name: 'Casa', currency: 'EUR', target: '1000', saved: '0' });
      await sync(phoneA, entropy, s.transport);
      expect((await sync(phoneB, entropy, s.transport)).status).toBe('pulled');
      expect(phoneB.local.accounts[0].credentialRef).toBe(mine);
      expect(phoneB.local.goals).toHaveLength(1);
    });
  });

  it('keeps a transfer whole through a sync round', async () => {
    const { entropy, s, a, phoneA, phoneB } = await twoPhones();
    const b = account({ balance: '0' });
    phoneA.local.accounts.push(b);
    await sync(phoneA, entropy, s.transport);
    await sync(phoneB, entropy, s.transport);

    transfer(phoneB.local, { from: a.id, to: b.id, sent: '30', received: '30', date: '2026-02-02T12:00:00.000Z',
      id: randomUUID(), outgoingId: randomUUID(), incomingId: randomUUID() });
    await sync(phoneB, entropy, s.transport);
    await sync(phoneA, entropy, s.transport);

    expect(balance(phoneA, a.id)).toBe('70');
    expect(balance(phoneA, b.id)).toBe('30');
  });
});
