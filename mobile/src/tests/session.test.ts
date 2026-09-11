import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { LocalVault, type SyncBaseRecord } from '../storage/repository';
import { VaultServerError } from '../services/vault-client';
import { account, stateWithAccounts } from './fixtures';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), load: vi.fn(), remove: vi.fn(), prune: vi.fn(), clear: vi.fn(), state: vi.fn(),
  saveSync: vi.fn(), loadSync: vi.fn(), deleteSync: vi.fn(), client: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => globalThis.crypto.randomUUID(),
  getRandomBytesAsync: async (n: number) => new Uint8Array(randomBytes(n)),
}));
vi.mock('../storage/secrets', () => ({ saveCredentials: mocks.save, loadCredentials: mocks.load,
  deleteCredentials: mocks.remove, pruneUnusedCredentials: mocks.prune,
  saveSyncSecrets: mocks.saveSync, loadSyncSecrets: mocks.loadSync, deleteSyncSecrets: mocks.deleteSync }));
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
beforeEach(() => {
  vi.resetAllMocks(); mocks.load.mockResolvedValue(credentials);
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
