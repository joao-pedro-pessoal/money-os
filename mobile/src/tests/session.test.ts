import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { LocalVault } from '../storage/repository';
import { account, stateWithAccounts } from './fixtures';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), load: vi.fn(), remove: vi.fn(), prune: vi.fn(), clear: vi.fn(), state: vi.fn(),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('../storage/secrets', () => ({ saveCredentials: mocks.save, loadCredentials: mocks.load,
  deleteCredentials: mocks.remove, pruneUnusedCredentials: mocks.prune }));
vi.mock('../services/connectors', () => ({
  SyncError: class extends Error {}, clearConnectorMemory: mocks.clear,
  createDirectConnector: () => ({ validateIdentifier: () => ({ ok: true }), getAccountState: mocks.state }),
}));
import { MobileSession } from '../services/session';
const credentials = { apiKey: 'test-key', apiSecret: 'test-secret', passphrase: '', address: '', readOnlyConfirmed: true as const };
async function setup() {
  const vault = await LocalVault.open({ read: async () => null, write: async () => undefined, close: async () => undefined });
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
