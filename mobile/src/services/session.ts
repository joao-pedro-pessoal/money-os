import { randomUUID, getRandomBytesAsync } from 'expo-crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { emptyState, type LocalState, type LocalAccount, type PlatformId } from '../domain/model';
import { LocalVault } from '../storage/repository';
import { type Credentials, saveCredentials, loadCredentials, deleteCredentials, pruneUnusedCredentials,
  saveSyncSecrets, loadSyncSecrets, deleteSyncSecrets, type SyncSecrets } from '../storage/secrets';
import { createDirectConnector, clearConnectorMemory, SyncError } from './connectors';
import { addAccount, applyReading } from '../domain/operations';
import { syncVault, type SyncOutcome } from '../domain/sync';
import { generateSeed, seedEntropy, seedFromEntropy, SeedError } from '../../../src/lib/vault/seed';
import { phoneVaultClient } from './vault-http';
import { VaultServerError, type VaultDevice } from './vault-client';

const VAULT_SYNC = 'vault-sync';

/** A seed refusal in the app's language, keeping which rule it broke. */
function seedProblem(error: unknown): Error {
  if (error instanceof SeedError) {
    if (error.problem === 'count') return new Error(`A seed de recuperação tem 12 palavras; escreveste ${error.count}.`);
    if (error.problem === 'unknown-word') return new Error(`“${error.word}” não é uma das palavras que formam a seed.`);
    return new Error('Todas as palavras existem, mas a verificação falhou: uma está errada ou fora de ordem.');
  }
  return error instanceof Error ? error : new Error(String(error));
}

export class MobileSession {
  private controller = new AbortController();
  private busy = new Set<string>();
  private live = true;
  constructor(readonly vault: LocalVault) {}
  private assertLive() { if (!this.live || !this.vault.isOpen) throw new Error('Desbloqueia a app para continuar.'); }
  async connect(name: string, platform: PlatformId, credentials: Credentials, existingId?: string): Promise<LocalState> {
    this.assertLive();
    if (!credentials.readOnlyConfirmed) throw new Error('Confirma as permissões de leitura.');
    if (platform !== 'hyperliquid' && (!credentials.apiKey.trim() || !credentials.apiSecret.trim())) throw new Error('Preenche a chave API e o segredo.');
    if (platform === 'okx' && !credentials.passphrase.trim()) throw new Error('Preenche a passphrase da API.');
    const connector = createDirectConnector(platform, credentials, this.controller.signal);
    const valid = connector.validateIdentifier(platform === 'hyperliquid' ? credentials.address : credentials.apiKey);
    if (!valid.ok) throw new Error('O formato das credenciais não é válido para esta plataforma.');
    const ref = randomUUID();
    const now = new Date().toISOString();
    const id = existingId ?? randomUUID();
    let oldRef: string | null = null;
    let committed = false;
    await saveCredentials(ref, credentials);
    try {
      this.assertLive();
      const result = await this.vault.update(state => {
        const old = state.accounts.find(a => a.id === existingId);
        if (existingId && (!old || old.platform !== platform)) throw new Error('Ligação incompatível.');
        if (old) { oldRef = old.credentialRef; old.credentialRef = ref; }
        else addAccount(state, { id, name: name.trim(), platform, credentialRef: ref, currency: 'USD',
          balance: '0', reading: null, syncedAt: null, createdAt: now });
      });
      committed = true;
      if (oldRef) await deleteCredentials(oldRef);
      return result;
    } catch (error) { if (!committed) await deleteCredentials(ref); throw error; }
  }
  async sync(accountId: string): Promise<LocalState> {
    this.assertLive();
    if (this.busy.has(accountId)) throw new Error('Esta conta já está a sincronizar.');
    const account = this.vault.snapshot().accounts.find(a => a.id === accountId);
    if (!account?.platform || !account.credentialRef) throw new Error('Liga primeiro esta conta.');
    this.busy.add(accountId);
    try {
      const credentials = await loadCredentials(account.credentialRef);
      this.assertLive();
      const connector = createDirectConnector(account.platform, credentials, this.controller.signal);
      const reading = await connector.getAccountState(credentials.address);
      this.assertLive();
      return await this.vault.update(state => {
        const current = state.accounts.find(a => a.id === accountId);
        if (current?.credentialRef !== account.credentialRef) throw new Error('A ligação foi alterada durante a sincronização.');
        applyReading(state, accountId, reading, new Date().toISOString(), randomUUID);
      });
    } catch (error) {
      if (error instanceof SyncError) throw error;
      // Provider errors may contain URLs, signed query strings or echoed secrets.
      throw new Error('A sincronização não foi concluída. Verifica as credenciais, região e permissões. O último saldo foi mantido.');
    } finally { this.busy.delete(accountId); clearConnectorMemory(); }
  }
  async disconnect(account: LocalAccount): Promise<LocalState> {
    this.assertLive();
    // If deletion fails, keep the reference so the user can retry. If the
    // subsequent DB write fails, the old reference simply needs reconnecting.
    if (account.credentialRef) await deleteCredentials(account.credentialRef);
    const result = await this.vault.update(state => {
      const current = state.accounts.find(a => a.id === account.id);
      if (current) current.credentialRef = null;
    });
    return result;
  }
  async restore(state: LocalState): Promise<LocalState> {
    this.assertLive();
    if (this.busy.size) throw new Error('Aguarda que a sincronização termine.');
    // Forgets the sync base in the same write; see LocalVault.restore.
    const result = await this.vault.restore(state);
    await pruneUnusedCredentials(state.accounts.map(a => a.credentialRef).filter((x): x is string => x !== null));
    return result;
  }

  private async syncSecrets(): Promise<SyncSecrets> {
    const secrets = await loadSyncSecrets();
    if (!secrets) throw new Error('Liga primeiro este dispositivo a uma conta de sincronização.');
    return secrets;
  }

  /**
   * Creates or joins a sync account on this device.
   *
   * Creating one issues a new seed and returns its words; they stay available on
   * this device only until `confirmSeedSaved`, and a sync is refused before that.
   * Joining one needs the words typed in, checked before the server is contacted —
   * a mistyped word is the person's to correct, not a failed sign-in.
   */
  async startSync(input: { server: string; email: string; password: string; deviceName: string;
    mode: 'register' | 'login'; seedWords?: string }): Promise<{ seedWords: string | null }> {
    this.assertLive();
    if (await loadSyncSecrets()) throw new Error('Este dispositivo já está ligado a uma conta de sincronização.');
    const client = phoneVaultClient(input.server, this.controller.signal);
    let words: string | null = null;
    let entropy: Uint8Array;
    try {
      if (input.mode === 'register') {
        words = await generateSeed(getRandomBytesAsync);
        entropy = seedEntropy(words);
      } else {
        entropy = seedEntropy(input.seedWords ?? '');
      }
    } catch (error) { throw seedProblem(error); }
    try {
      const body = { email: input.email, password: input.password, deviceName: input.deviceName };
      const account = input.mode === 'register' ? await client.register(body) : await client.login(body);
      this.assertLive();
      // A base left from an earlier account must never be merged against this one.
      await this.vault.forgetSync();
      await saveSyncSecrets({ server: new URL(input.server).origin, userId: account.userId, deviceId: account.deviceId,
        token: account.token, entropy: bytesToHex(entropy), seedConfirmed: input.mode === 'login' });
      return { seedWords: words };
    } finally { entropy.fill(0); }
  }

  /** The words of a seed not yet confirmed as written down, or null. */
  async pendingSeedWords(): Promise<string | null> {
    this.assertLive();
    const secrets = await loadSyncSecrets();
    if (!secrets || secrets.seedConfirmed) return null;
    const entropy = hexToBytes(secrets.entropy);
    try { return seedFromEntropy(entropy); } finally { entropy.fill(0); }
  }

  async confirmSeedSaved(): Promise<void> {
    this.assertLive();
    const secrets = await this.syncSecrets();
    await saveSyncSecrets({ ...secrets, seedConfirmed: true });
  }

  async syncStatus(): Promise<{ server: string; deviceId: string; version: number; seedConfirmed: boolean } | null> {
    this.assertLive();
    const secrets = await loadSyncSecrets();
    if (!secrets) return null;
    const base = await this.vault.syncBase();
    return { server: secrets.server, deviceId: secrets.deviceId, version: base?.version ?? 0, seedConfirmed: secrets.seedConfirmed };
  }

  /**
   * One sync round with the server, applied only if nothing changed while it ran.
   *
   * `applied: false` with a pushed or merged outcome is not a loss: the server has
   * what was sent, and the next round merges it with the newer edits.
   */
  async syncNow(): Promise<{ outcome: SyncOutcome; applied: boolean }> {
    this.assertLive();
    if (this.busy.has(VAULT_SYNC)) throw new Error('A sincronização já está a decorrer.');
    const secrets = await this.syncSecrets();
    if (!secrets.seedConfirmed) throw new Error('Confirma primeiro que guardaste as 12 palavras.');
    this.busy.add(VAULT_SYNC);
    const entropy = hexToBytes(secrets.entropy);
    try {
      const base = await this.vault.syncBase();
      const local = this.vault.snapshot();
      const outcome = await syncVault({
        userId: secrets.userId, entropy, baseVersion: base?.version ?? 0, base: base?.state ?? emptyState(), local,
        transport: phoneVaultClient(secrets.server, this.controller.signal).transport(secrets.token),
        random: getRandomBytesAsync,
      });
      this.assertLive();
      if (!('local' in outcome)) return { outcome, applied: false };
      const result = await this.vault.applySync(local, outcome.local, outcome.base, outcome.version);
      return { outcome, applied: result.applied };
    } catch (error) {
      if (error instanceof VaultServerError && error.status === 401)
        throw new Error('A sessão de sincronização deste dispositivo terminou ou foi revogada. Deixa de sincronizar e volta a entrar.');
      throw error;
    } finally { entropy.fill(0); this.busy.delete(VAULT_SYNC); }
  }

  async syncDevices(): Promise<VaultDevice[]> {
    this.assertLive();
    const secrets = await this.syncSecrets();
    return phoneVaultClient(secrets.server, this.controller.signal).devices(secrets.token);
  }

  async revokeSyncDevice(deviceId: string): Promise<void> {
    this.assertLive();
    const secrets = await this.syncSecrets();
    await phoneVaultClient(secrets.server, this.controller.signal).revoke(secrets.token, deviceId);
  }

  /**
   * Stops syncing on this device and keeps every local record.
   *
   * The base is forgotten before the session. The other order, interrupted between
   * the two, could leave a base with no account — and a later sign-in to a different
   * account would merge against it.
   */
  async stopSync(): Promise<void> {
    this.assertLive();
    if (this.busy.has(VAULT_SYNC)) throw new Error('Aguarda que a sincronização termine.');
    await this.vault.forgetSync();
    await deleteSyncSecrets();
  }

  async close(): Promise<void> {
    if (!this.live) return;
    this.live = false;
    this.controller.abort();
    clearConnectorMemory();
    await this.vault.close();
  }
}
