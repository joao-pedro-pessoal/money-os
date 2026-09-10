import { describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { encryptBackup, decryptBackup } from '../domain/backup';
import { account, stateWithAccounts } from './fixtures';

const random = async (n: number) => new Uint8Array(randomBytes(n));
const password = 'uma frase suficientemente longa';
describe('portable encrypted backup', () => {
  it('round-trips every collection and excludes reconnection references', async () => {
    const a = account({ platform: 'trading212', credentialRef: randomUUID() });
    const state = stateWithAccounts(a);
    state.goals.push({ id: randomUUID(), name: 'Casa', currency: 'EUR', target: '20000', saved: '500' });
    state.commitments.push({ id: randomUUID(), name: 'Internet', currency: 'EUR', amount: '30', period: 'monthly' });
    state.events.push({ id: randomUUID(), accountId: a.id, date: a.createdAt, type: 'DIVIDEND', amount: '2.5', currency: 'EUR',
      symbol: 'ABC', quantity: null, price: null, fees: null, source: 'csv', externalId: 'test', description: 'Private note', transferId: null });
    state.snapshots.push({ id: randomUUID(), accountId: a.id, date: a.createdAt, value: '100', currency: 'EUR', partial: false });
    const encoded = await encryptBackup(state, password, random);
    expect(encoded).not.toContain('Private note');
    expect(encoded).not.toContain(a.credentialRef);
    const restored = await decryptBackup(encoded, password);
    expect(restored).toEqual({ ...state, accounts: [{ ...a, credentialRef: null }] });
    expect(state.accounts[0].credentialRef).toBe(a.credentialRef);
  });
  it('rejects wrong passwords and ciphertext tampering', async () => {
    const encoded = await encryptBackup(stateWithAccounts(account()), password, random);
    await expect(decryptBackup(encoded, password + '!')).rejects.toThrow('incorreta');
    const tampered = JSON.parse(encoded); const data = Buffer.from(tampered.ciphertext, 'base64'); data[0] ^= 1;
    tampered.ciphertext = data.toString('base64');
    await expect(decryptBackup(JSON.stringify(tampered), password)).rejects.toThrow('danificado');
  });
  it('rejects unbounded KDF work and unknown format before deriving a key', async () => {
    await expect(decryptBackup(JSON.stringify({ format: 'money-os-local-backup', version: 1, kdf: 'PBKDF2-SHA256',
      iterations: 9999999999, salt: '', nonce: '', ciphertext: '' }), password)).rejects.toThrow('Escolhe');
  });
});
