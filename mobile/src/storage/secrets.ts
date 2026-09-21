import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'money-os.local-vault.v1',
};
export const CredentialSchema = z.object({
  apiKey: z.string().max(1000).default(''),
  apiSecret: z.string().max(1000).default(''),
  passphrase: z.string().max(1000).default(''),
  address: z.string().max(100).default(''),
  readOnlyConfirmed: z.literal(true),
}).strict();
export type Credentials = z.infer<typeof CredentialSchema>;
const REGISTRY_KEY = 'connection.registry';
async function registeredRefs(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(REGISTRY_KEY, options);
  return raw ? z.array(z.string().uuid()).parse(JSON.parse(raw)) : [];
}
const refPattern = /^[a-f0-9-]{36}$/i;
function credentialKey(ref: string): string {
  if (!refPattern.test(ref)) throw new Error('Referência de credencial inválida.');
  return `connection.${ref}`;
}
export async function databaseKey(existingDatabase: boolean): Promise<string> {
  if (!await SecureStore.isAvailableAsync()) throw new Error('O cofre do dispositivo não está disponível.');
  let key = await SecureStore.getItemAsync('database.key', options);
  if (!key) {
    if (existingDatabase) throw new Error('A chave deste cofre não está disponível. Restaura um backup num dispositivo configurado de novo.');
    key = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync('database.key', key, options);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('A chave do cofre é inválida.');
  return key;
}
export async function saveCredentials(ref: string, value: Credentials): Promise<void> {
  const parsed = CredentialSchema.parse(value);
  // Credentials are small; explicit cap also respects native secure-store limits.
  const encoded = JSON.stringify(parsed);
  if (encoded.length > 1800) throw new Error('Credenciais demasiado longas.');
  // Register before writing so an interrupted connection setup can be cleaned
  // on the next unlock, even if the database never received its reference.
  const refs = await registeredRefs();
  if (!refs.includes(ref)) await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify([...refs, ref]), options);
  await SecureStore.setItemAsync(credentialKey(ref), encoded, options);
}
export async function loadCredentials(ref: string): Promise<Credentials> {
  const raw = await SecureStore.getItemAsync(credentialKey(ref), options);
  if (!raw) throw new Error('Volta a ligar esta corretora. As chaves não fazem parte dos backups.');
  return CredentialSchema.parse(JSON.parse(raw));
}
export async function deleteCredentials(ref: string): Promise<void> {
  await SecureStore.deleteItemAsync(credentialKey(ref), options);
  const refs = await registeredRefs();
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify(refs.filter(item => item !== ref)), options);
}
export async function pruneUnusedCredentials(keep: string[]): Promise<void> {
  for (const ref of await registeredRefs()) if (!keep.includes(ref)) await deleteCredentials(ref);
}
/**
 * This device's sync account: the server, the session and the seed's entropy.
 *
 * Device secrets for the same reason broker keys are. The token lets anyone fetch
 * the account's ciphertext and the entropy lets them read it, so neither goes into
 * the vault, a backup or the sync payload.
 */
export const SyncSecretsSchema = z.object({
  server: z.string().max(300).pipe(z.url()),
  userId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  token: z.string().regex(/^[0-9a-f]{64}$/),
  entropy: z.string().regex(/^[0-9a-f]{32}$/),
  /** False until the person confirms the twelve words are written down. */
  seedConfirmed: z.boolean(),
}).strict();
export type SyncSecrets = z.infer<typeof SyncSecretsSchema>;
const SYNC_KEY = 'sync.account';
export async function saveSyncSecrets(value: SyncSecrets): Promise<void> {
  await SecureStore.setItemAsync(SYNC_KEY, JSON.stringify(SyncSecretsSchema.parse(value)), options);
}
export async function loadSyncSecrets(): Promise<SyncSecrets | null> {
  const raw = await SecureStore.getItemAsync(SYNC_KEY, options);
  return raw ? SyncSecretsSchema.parse(JSON.parse(raw)) : null;
}
export async function deleteSyncSecrets(): Promise<void> {
  await SecureStore.deleteItemAsync(SYNC_KEY, options);
}

/**
 * Sessions this device stopped using and has not yet ended on the server.
 *
 * Stopping sync used to forget the token here and leave it valid there until it
 * expired — a token that fetches the account's ciphertext, sitting in a backup
 * of the phone or a copy of its storage. Stopping now ends it on the server, and
 * when there is no network the token is kept here, as a device secret like the
 * one it came from, until an attempt gets through.
 */
export const PendingSignOutSchema = SyncSecretsSchema.pick({ server: true, deviceId: true, token: true }).strict();
export type PendingSignOut = z.infer<typeof PendingSignOutSchema>;
const PENDING_SIGN_OUT_KEY = 'sync.pending-sign-out';
/** More than this and the oldest is dropped: it has long expired on the server anyway. */
const MAX_PENDING_SIGN_OUTS = 8;
export async function loadPendingSignOuts(): Promise<PendingSignOut[]> {
  const raw = await SecureStore.getItemAsync(PENDING_SIGN_OUT_KEY, options);
  return raw ? z.array(PendingSignOutSchema).parse(JSON.parse(raw)) : [];
}
export async function savePendingSignOuts(list: readonly PendingSignOut[]): Promise<void> {
  const unique = [...new Map(list.map(entry => [entry.token, PendingSignOutSchema.parse(entry)])).values()];
  if (unique.length === 0) await SecureStore.deleteItemAsync(PENDING_SIGN_OUT_KEY, options);
  else await SecureStore.setItemAsync(PENDING_SIGN_OUT_KEY, JSON.stringify(unique.slice(-MAX_PENDING_SIGN_OUTS)), options);
}
