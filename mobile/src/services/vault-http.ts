import { fetch as nativeFetch } from 'expo/fetch';
import { createVaultClient } from './vault-client';

/**
 * The sync server client as the phone runs it: Expo's native fetch, cancelled
 * with the session. Kept apart from vault-client.ts so that module stays free of
 * Expo imports and runs, and is tested, outside the app.
 */
export function phoneVaultClient(server: string, signal: AbortSignal) {
  return createVaultClient({ server, fetch: nativeFetch, signal });
}
