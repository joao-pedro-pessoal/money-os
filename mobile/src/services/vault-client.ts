import type { StoredVault, SyncTransport } from '../domain/sync';
import { assertVaultRequest, vaultServerOrigin } from './network-policy';

/**
 * The app's side of the encrypted sync server's HTTP API.
 *
 * Built like the broker transport in connectors.ts — policy checked before every
 * request, no redirects, no cookies, a timeout, and cancellation with the session
 * — but with `fetch` passed in rather than imported from `expo/fetch`. That keeps
 * it runnable outside Expo, so the same client the phone uses can be tested and
 * pointed at a real local server end to end.
 *
 * What travels is a token and ciphertext. The seed, the vault key and the
 * decrypted vault never reach this module.
 */

export type VaultFetch = (url: string, init: {
  method: string; headers: Record<string, string>; body?: string;
  signal: AbortSignal; redirect: 'error'; credentials: 'omit';
}) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

export class VaultServerError extends Error {
  constructor(readonly status: number | null, message: string) {
    super(message);
    this.name = 'VaultServerError';
  }
}

export interface VaultSession { token: string; userId: string; deviceId: string }
export interface VaultDevice { id: string; name: string; createdAt: string; lastSeenAt: string | null; revokedAt: string | null; current: boolean }

const TIMEOUT_MS = 25000;
/** A vault can be large; nothing else this server sends should be. */
const MAX_VAULT_CHARS = 50_000_000;
const MAX_OTHER_CHARS = 1_000_000;

export function createVaultClient(options: { server: string; fetch: VaultFetch; signal?: AbortSignal }) {
  const origin = vaultServerOrigin(options.server);

  async function call(method: string, path: string, init: { token?: string; body?: unknown; limit?: number } = {}) {
    const url = `${origin}${path}`;
    assertVaultRequest(origin, url, method);
    if (options.signal?.aborted) throw new VaultServerError(null, 'Sincronização cancelada.');

    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (init.token !== undefined) headers.Authorization = `Bearer ${init.token}`;
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';

      let response: Awaited<ReturnType<VaultFetch>>;
      try {
        response = await options.fetch(url, {
          method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: controller.signal, redirect: 'error', credentials: 'omit',
        });
      } catch {
        throw new VaultServerError(null, 'Não foi possível contactar o servidor de sincronização. Verifica a ligação.');
      }

      const limit = init.limit ?? MAX_OTHER_CHARS;
      if (Number(response.headers.get('content-length') ?? 0) > limit) {
        throw new VaultServerError(response.status, 'Resposta do servidor demasiado grande.');
      }
      const text = await response.text();
      if (text.length > limit) throw new VaultServerError(response.status, 'Resposta do servidor demasiado grande.');

      let data: unknown = null;
      if (text !== '') {
        try {
          data = JSON.parse(text);
        } catch {
          // What came back, rather than a generic failure nobody can act on.
          throw new VaultServerError(
            response.status, `O servidor devolveu HTTP ${response.status} com uma resposta ilegível: ${text.slice(0, 200)}`
          );
        }
      }
      return { status: response.status, data };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  /** The server's own reason, quoted, so a refusal says what to fix. */
  function fail(status: number, data: unknown): never {
    const reason = data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error : null;
    throw new VaultServerError(status, reason ? `O servidor recusou (HTTP ${status}): ${reason}` : `O servidor devolveu HTTP ${status}.`);
  }

  function session(data: unknown): VaultSession {
    const d = data as Partial<VaultSession> | null;
    if (!d || typeof d.token !== 'string' || !/^[0-9a-f]{64}$/.test(d.token) ||
        typeof d.userId !== 'string' || typeof d.deviceId !== 'string') {
      throw new VaultServerError(null, 'O servidor devolveu uma sessão inválida.');
    }
    return { token: d.token, userId: d.userId, deviceId: d.deviceId };
  }

  return {
    async register(body: { email: string; password: string; deviceName: string }): Promise<VaultSession> {
      const r = await call('POST', '/api/vault/register', { body });
      if (r.status !== 201) fail(r.status, r.data);
      return session(r.data);
    },

    async login(body: { email: string; password: string; deviceName: string }): Promise<VaultSession> {
      const r = await call('POST', '/api/vault/login', { body });
      if (r.status !== 200) fail(r.status, r.data);
      return session(r.data);
    },

    /** The transport a sync round needs, bound to one device's session. */
    transport(token: string): SyncTransport {
      return {
        async latest(): Promise<StoredVault | null> {
          const r = await call('GET', '/api/vault', { token, limit: MAX_VAULT_CHARS });
          if (r.status === 204) return null;
          if (r.status !== 200) fail(r.status, r.data);
          const d = r.data as Partial<StoredVault> | null;
          if (!d || !Number.isSafeInteger(d.vaultVersion) || typeof d.text !== 'string') {
            throw new VaultServerError(200, 'O servidor devolveu um cofre sem versão ou sem conteúdo.');
          }
          return { vaultVersion: d.vaultVersion as number, text: d.text };
        },
        async put(vault: StoredVault, expectedVersion: number): Promise<boolean> {
          const r = await call('PUT', '/api/vault', {
            token, body: { vaultVersion: vault.vaultVersion, expectedVersion, text: vault.text },
          });
          if (r.status === 201) return true;
          // Another device got there first: the sync round reads, merges and sends again.
          if (r.status === 409) return false;
          return fail(r.status, r.data);
        },
      };
    },

    async devices(token: string): Promise<VaultDevice[]> {
      const r = await call('GET', '/api/vault/devices', { token });
      if (r.status !== 200) fail(r.status, r.data);
      const list = (r.data as { devices?: unknown } | null)?.devices;
      if (!Array.isArray(list)) throw new VaultServerError(200, 'O servidor devolveu uma lista de dispositivos inválida.');
      return list as VaultDevice[];
    },

    async revoke(token: string, deviceId: string): Promise<void> {
      const r = await call('DELETE', `/api/vault/devices/${deviceId}`, { token });
      if (r.status !== 200) fail(r.status, r.data);
    },
  };
}
