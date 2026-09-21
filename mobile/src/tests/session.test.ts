import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { LocalVault, type SyncBaseRecord } from '../storage/repository';
import { VaultServerError } from '../services/vault-client';
import { account, stateWithAccounts } from './fixtures';
import { generateSeed, seedEntropy } from '../../../src/lib/vault/seed';
import { encryptVault } from '../../../src/lib/vault/cipher';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), load: vi.fn(), remove: vi.fn(), prune: vi.fn(), clear: vi.fn(), state: vi.fn(),
  saveSync: vi.fn(), loadSync: vi.fn(), deleteSync: vi.fn(), client: vi.fn(),
  loadPending: vi.fn(), savePending: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => globalThis.crypto.randomUUID(),
  getRandomBytesAsync: async (n: number) => new Uint8Array(randomBytes(n)),
}));
vi.mock('../storage/secrets', () => ({ saveCredentials: mocks.save, loadCredentials: mocks.load,
  deleteCredentials: mocks.remove, pruneUnusedCredentials: mocks.prune,
  saveSyncSecrets: mocks.saveSync, loadSyncSecrets: mocks.loadSync, deleteSyncSecrets: mocks.deleteSync,
  loadPendingSignOuts: mocks.loadPending, savePendingSignOuts: mocks.savePending }));
vi.mock('../services/connectors', () => ({
  SyncError: class extends Error {}, clearConnectorMemory: mocks.clear,
  createDirectConnector: () => ({ validateIdentifier: () => ({ ok: true }), getAccountState: mocks.state }),
}));
vi.mock('../services/vault-http', () => ({ phoneVaultClient: mocks.client }));
import { MobileSession } from '../services/session';
const credentials = { apiKey: 'test-key', apiSecret: 'test-secret', passphrase: '', address: '', readOnlyConfirmed: true as const };
async function setup() {
  let base: SyncBaseRecord | null = null;
  const vault = await LocalVault.open({ read: async () => null, write: async () => undefined,
    readSyncBase: async () => base, writeWithSyncBase: async (_json, next) => { base = next; }, close: async () => undefined });
  const a = account({ platform: 'trading212', credentialRef: randomUUID() });
  await vault.replace(stateWithAccounts(a));
  return { vault, a, session: new MobileSession(vault) };
}
/** The pending sign-outs, kept in memory the way SecureStore keeps them on a phone. */
let pending: { server: string; deviceId: string; token: string }[] = [];
beforeEach(() => {
  vi.resetAllMocks(); mocks.load.mockResolvedValue(credentials);
  pending = [];
  mocks.loadPending.mockImplementation(async () => [...pending]);
  mocks.savePending.mockImplementation(async (list: typeof pending) => { pending = [...list]; });
});
describe('connection lifecycle', () => {
  it('does not overwrite a reading or expose broker error contents when a sync fails', async () => {
    const { vault, a, session } = await setup(); const before = vault.snapshot();
    mocks.state.mockRejectedValue(new Error('secret-api-key-in-provider-error'));
    await expect(session.sync(a.id)).rejects.toThrow('último saldo');
    expect(vault.snapshot()).toEqual(before); await session.close();
  });
  it('keeps the reference if SecureStore refuses deletion so the user can retry', async () => {
    const { vault, a, session } = await setup(); mocks.remove.mockRejectedValue(new Error('locked'));
    await expect(session.disconnect(a)).rejects.toThrow('locked');
    expect(vault.snapshot().accounts[0].credentialRef).toBe(a.credentialRef); await session.close();
  });
  it('does not erase newly committed credentials if cleaning up the old key fails', async () => {
    const { vault, a, session } = await setup(); mocks.remove.mockRejectedValue(new Error('cleanup failed'));
    await expect(session.connect(a.name, 'trading212', credentials, a.id)).rejects.toThrow('cleanup failed');
    const ref = vault.snapshot().accounts[0].credentialRef;
    expect(ref).not.toBe(a.credentialRef);
    expect(mocks.save).toHaveBeenCalledWith(ref, credentials);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith(a.credentialRef); await session.close();
  });
  it('refuses to apply a network reply after the app locks', async () => {
    const { vault, a, session } = await setup();
    let finish!: (reading: unknown) => void;
    mocks.state.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const syncing = session.sync(a.id);
    await vi.waitFor(() => expect(mocks.state).toHaveBeenCalled());
    await session.close(); finish({});
    await expect(syncing).rejects.toThrow(); expect(vault.isOpen).toBe(false);
  });
});

const confirmed = { server: 'http://10.0.2.2:3000', userId: 'user_1', deviceId: 'device_1',
  token: 'a'.repeat(64), entropy: '00'.repeat(16), seedConfirmed: true };
const signedIn = { token: 'b'.repeat(64), userId: 'user_1', deviceId: 'device_2' };

describe('sync account on this device', () => {
  it('issues twelve words on sign-up and keeps them only until they are confirmed', async () => {
    const { session } = await setup();
    const register = vi.fn().mockResolvedValue(signedIn);
    mocks.client.mockReturnValue({ register, login: vi.fn() });
    mocks.loadSync.mockResolvedValue(null);

    const { seedWords } = await session.startSync({ server: 'http://10.0.2.2:3000', email: 'a@b.pt',
      password: 'uma frase suficientemente longa', deviceName: 'Pixel', mode: 'register' });
    expect(seedWords?.split(' ')).toHaveLength(12);
    const stored = mocks.saveSync.mock.calls[0][0];
    expect(stored).toMatchObject({ userId: 'user_1', deviceId: 'device_2', seedConfirmed: false });

    mocks.loadSync.mockResolvedValue(stored);
    expect(await session.pendingSeedWords()).toBe(seedWords);
    await session.confirmSeedSaved();
    expect(mocks.saveSync).toHaveBeenLastCalledWith({ ...stored, seedConfirmed: true });
    await session.close();
  });

  it('refuses a mistyped seed before contacting the server, in Portuguese', async () => {
    const { session } = await setup();
    const login = vi.fn();
    mocks.client.mockReturnValue({ register: vi.fn(), login });
    mocks.loadSync.mockResolvedValue(null);

    await expect(session.startSync({ server: 'http://10.0.2.2:3000', email: 'a@b.pt', password: 'x', deviceName: 'Pixel',
      mode: 'login', seedWords: 'abandon abandon abandon' })).rejects.toThrow('escreveste 3');
    expect(login).not.toHaveBeenCalled();
    await session.close();
  });

  /**
   * The seed's checksum accepts about one mistyped word in sixteen. Joining
   * used to write the words down as confirmed on the strength of that alone,
   * and the first sync then sealed the account's vault under the wrong key.
   */
  it('refuses a seed that does not open the account it is joining', async () => {
    const { session } = await setup();
    const words = await generateSeed(async (n: number) => new Uint8Array(randomBytes(n)));
    const other = seedEntropy(await generateSeed(async (n: number) => new Uint8Array(randomBytes(n))));
    const stored = await encryptVault({ plaintext: new TextEncoder().encode('{}'), entropy: other,
      userId: signedIn.userId, vaultVersion: 1, random: async (n: number) => new Uint8Array(randomBytes(n)) });
    const latest = vi.fn().mockResolvedValue({ vaultVersion: 1, text: stored });
    mocks.client.mockReturnValue({ register: vi.fn(), login: vi.fn().mockResolvedValue(signedIn),
      transport: () => ({ latest, put: vi.fn() }) });
    mocks.loadSync.mockResolvedValue(null);

    await expect(session.startSync({ server: 'http://10.0.2.2:3000', email: 'a@b.pt', password: 'x',
      deviceName: 'Pixel', mode: 'login', seedWords: words })).rejects.toThrow('não abrem o cofre');
    // Nothing kept: a device that cannot read the account must not be able to
    // write to it either.
    expect(mocks.saveSync).not.toHaveBeenCalled();
    await session.close();
  });

  it('joins when the words open the account, and counts them as confirmed', async () => {
    const { session } = await setup();
    const words = await generateSeed(async (n: number) => new Uint8Array(randomBytes(n)));
    const stored = await encryptVault({ plaintext: new TextEncoder().encode('{}'), entropy: seedEntropy(words),
      userId: signedIn.userId, vaultVersion: 1, random: async (n: number) => new Uint8Array(randomBytes(n)) });
    mocks.client.mockReturnValue({ register: vi.fn(), login: vi.fn().mockResolvedValue(signedIn),
      transport: () => ({ latest: vi.fn().mockResolvedValue({ vaultVersion: 1, text: stored }), put: vi.fn() }) });
    mocks.loadSync.mockResolvedValue(null);

    await session.startSync({ server: 'http://10.0.2.2:3000', email: 'a@b.pt', password: 'x',
      deviceName: 'Pixel', mode: 'login', seedWords: words });
    expect(mocks.saveSync.mock.calls[0][0]).toMatchObject({ userId: 'user_1', seedConfirmed: true });
    await session.close();
  });

  /**
   * Nothing stored is nothing to check against, and a seed nobody can check is
   * a seed that must not seal the first vault.
   */
  it('refuses to join an account that has stored no vault yet', async () => {
    const { session } = await setup();
    const words = await generateSeed(async (n: number) => new Uint8Array(randomBytes(n)));
    mocks.client.mockReturnValue({ register: vi.fn(), login: vi.fn().mockResolvedValue(signedIn),
      transport: () => ({ latest: vi.fn().mockResolvedValue(null), put: vi.fn() }) });
    mocks.loadSync.mockResolvedValue(null);

    await expect(session.startSync({ server: 'http://10.0.2.2:3000', email: 'a@b.pt', password: 'x',
      deviceName: 'Pixel', mode: 'login', seedWords: words })).rejects.toThrow('Sincronizar uma vez');
    expect(mocks.saveSync).not.toHaveBeenCalled();
    await session.close();
  });

  it('refuses to sync before the words are confirmed, and sends nothing', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue({ ...confirmed, seedConfirmed: false });
    await expect(session.syncNow()).rejects.toThrow('12 palavras');
    expect(mocks.client).not.toHaveBeenCalled();
    await session.close();
  });

  it('explains a revoked session instead of reporting a bare 401', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue(confirmed);
    mocks.client.mockReturnValue({ transport: () => ({
      latest: vi.fn().mockRejectedValue(new VaultServerError(401, 'O servidor recusou (HTTP 401)')), put: vi.fn(),
    }) });
    await expect(session.syncNow()).rejects.toThrow('revogada');
    await session.close();
  });

  it('forgets the sync base before the session when it stops syncing', async () => {
    // The other order, interrupted between the two, could leave a base with no
    // account for a later sign-in to a different account to merge against.
    const { vault, session } = await setup();
    const forget = vi.spyOn(vault, 'forgetSync');
    mocks.deleteSync.mockResolvedValue(undefined);

    await session.stopSync();
    expect(forget.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteSync.mock.invocationCallOrder[0]);
    await session.close();
  });
});

describe('ending the session on the server when this device stops syncing', () => {
  /**
   * Stopping used to forget the token here and leave it valid on the server
   * until it expired: a token that fetches the account's ciphertext.
   */
  it('revokes this device on the server, and keeps nothing waiting', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue(confirmed);
    const revoke = vi.fn().mockResolvedValue(undefined);
    mocks.client.mockReturnValue({ revoke });
    expect(await session.stopSync()).toEqual({ endedOnServer: true });
    expect(revoke).toHaveBeenCalledWith(confirmed.token, confirmed.deviceId);
    expect(mocks.deleteSync).toHaveBeenCalled();
    expect(pending).toEqual([]);
    await session.close();
  });

  it('stops anyway without network, and keeps the session to end later', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue(confirmed);
    mocks.client.mockReturnValue({ revoke: vi.fn().mockRejectedValue(new VaultServerError(null, 'Sem ligação')) });
    expect(await session.stopSync()).toEqual({ endedOnServer: false });
    expect(mocks.deleteSync).toHaveBeenCalled();
    expect(pending).toEqual([{ server: confirmed.server, deviceId: confirmed.deviceId, token: confirmed.token }]);
    await session.close();
  });

  /** Written down first, so an interruption between the two can never lose it. */
  it('records the session as waiting before it forgets it', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue(confirmed);
    mocks.client.mockReturnValue({ revoke: vi.fn().mockResolvedValue(undefined) });
    await session.stopSync();
    expect(mocks.savePending.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteSync.mock.invocationCallOrder[0]);
    await session.close();
  });

  it('ends a waiting session once the server answers, and counts an already-ended one as done', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue(null);
    pending = [
      { server: confirmed.server, deviceId: 'device_1', token: 'c'.repeat(64) },
      { server: confirmed.server, deviceId: 'device_2', token: 'd'.repeat(64) },
      { server: confirmed.server, deviceId: 'device_3', token: 'e'.repeat(64) },
    ];
    const revoke = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new VaultServerError(401, 'O servidor recusou (HTTP 401)'))
      .mockRejectedValueOnce(new VaultServerError(null, 'Sem ligação'));
    mocks.client.mockReturnValue({ revoke });
    expect(await session.finishPendingSignOuts()).toBe(1);
    expect(pending.map(p => p.deviceId)).toEqual(['device_3']);
    await session.close();
  });

  /** A stop interrupted before it forgot the session never happened. */
  it('never ends the session this device is still syncing with', async () => {
    const { session } = await setup();
    mocks.loadSync.mockResolvedValue(confirmed);
    pending = [{ server: confirmed.server, deviceId: confirmed.deviceId, token: confirmed.token }];
    const revoke = vi.fn();
    mocks.client.mockReturnValue({ revoke });
    expect(await session.finishPendingSignOuts()).toBe(0);
    expect(revoke).not.toHaveBeenCalled();
    expect(pending).toEqual([]);
    await session.close();
  });

  it('does not lose a stop made while a retry is still running', async () => {
    const { session } = await setup();
    pending = [{ server: confirmed.server, deviceId: 'device_9', token: 'f'.repeat(64) }];
    let release!: () => void;
    const revoke = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { release = () => reject(new VaultServerError(null, 'Sem ligação')); }))
      .mockRejectedValue(new VaultServerError(null, 'Sem ligação'));
    mocks.client.mockReturnValue({ revoke });
    mocks.loadSync.mockResolvedValueOnce(null).mockResolvedValue(confirmed);
    const retry = session.finishPendingSignOuts();
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledTimes(1));
    const stopping = session.stopSync();
    release();
    await retry; await stopping;
    expect(pending.map(p => p.token).sort()).toEqual([confirmed.token, 'f'.repeat(64)].sort());
    await session.close();
  });
});
