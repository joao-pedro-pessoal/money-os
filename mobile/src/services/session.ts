import { randomUUID } from 'expo-crypto';
import { type LocalState, type LocalAccount, type PlatformId } from '../domain/model';
import { LocalVault } from '../storage/repository';
import { type Credentials, saveCredentials, loadCredentials, deleteCredentials, pruneUnusedCredentials } from '../storage/secrets';
import { createDirectConnector, clearConnectorMemory, SyncError } from './connectors';
import { addAccount, applyReading } from '../domain/operations';

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
    const result = await this.vault.replace(state);
    await pruneUnusedCredentials(state.accounts.map(a => a.credentialRef).filter((x): x is string => x !== null));
    return result;
  }
  async close(): Promise<void> {
    if (!this.live) return;
    this.live = false;
    this.controller.abort();
    clearConnectorMemory();
    await this.vault.close();
  }
}
