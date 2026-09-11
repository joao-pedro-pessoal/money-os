import { describe, it, expect } from 'vitest';
import { createVaultClient, VaultServerError, type VaultFetch } from '../services/vault-client';
import { assertVaultRequest, vaultServerOrigin } from '../services/network-policy';

const token = 'a'.repeat(64);
const sessionBody = { token, userId: 'user_1', deviceId: 'device_1' };

function fake(respond: (url: string, init: Parameters<VaultFetch>[1]) => { status: number; body?: unknown }) {
  const calls: { url: string; init: Parameters<VaultFetch>[1] }[] = [];
  const fetch: VaultFetch = async (url, init) => {
    calls.push({ url, init });
    const r = respond(url, init);
    const text = r.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return { status: r.status, headers: { get: () => null }, text: async () => text };
  };
  return { fetch, calls };
}

async function refusal(promise: Promise<unknown>): Promise<VaultServerError> {
  try { await promise; } catch (error) { if (error instanceof VaultServerError) return error; throw error; }
  throw new Error('expected the request to be refused');
}

describe('where the sync server may be', () => {
  it('requires HTTPS except on the addresses a developer machine answers on', () => {
    expect(vaultServerOrigin('https://sync.example.com')).toBe('https://sync.example.com');
    expect(vaultServerOrigin('http://10.0.2.2:3000')).toBe('http://10.0.2.2:3000');
    expect(vaultServerOrigin('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000');
    expect(() => vaultServerOrigin('http://sync.example.com')).toThrow(/HTTPS/);
  });

  it('refuses an address carrying a path, parameters or credentials', () => {
    expect(() => vaultServerOrigin('https://sync.example.com/other')).toThrow(/sem caminho/);
    expect(() => vaultServerOrigin('https://user:pw@sync.example.com')).toThrow(/sem caminho/);
    expect(() => vaultServerOrigin('https://sync.example.com?x=1')).toThrow(/sem caminho/);
  });

  it('allows only the server\'s own routes and methods', () => {
    const origin = 'https://sync.example.com';
    expect(() => assertVaultRequest(origin, `${origin}/api/vault`, 'PUT')).not.toThrow();
    expect(() => assertVaultRequest(origin, `${origin}/api/vault`, 'DELETE')).toThrow(/bloqueado/);
    expect(() => assertVaultRequest(origin, 'https://elsewhere.example.com/api/vault', 'GET')).toThrow(/bloqueado/);
    expect(() => assertVaultRequest(origin, `${origin}/api/sync`, 'POST')).toThrow(/bloqueado/);
  });
});

describe('talking to the sync server', () => {
  it('signs up without a token, refusing redirects and cookies', async () => {
    const f = fake(() => ({ status: 201, body: sessionBody }));
    const client = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch });

    expect(await client.register({ email: 'a@b.pt', password: 'x'.repeat(12), deviceName: 'Pixel' })).toEqual(sessionBody);
    const { url, init } = f.calls[0];
    expect(url).toBe('https://sync.example.com/api/vault/register');
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    expect(init.credentials).toBe('omit');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('quotes the server\'s reason when it refuses', async () => {
    const f = fake(() => ({ status: 401, body: { error: 'That address and password do not match an account.' } }));
    const client = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch });

    const error = await refusal(client.login({ email: 'a@b.pt', password: 'wrong', deviceName: 'Pixel' }));
    expect(error.status).toBe(401);
    expect(error.message).toContain('do not match an account');
  });

  it('reads no vault as null and a stored one with its version', async () => {
    let stored: unknown = undefined;
    const f = fake(() => (stored === undefined ? { status: 204 } : { status: 200, body: stored }));
    const transport = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch }).transport(token);

    expect(await transport.latest()).toBeNull();
    stored = { vaultVersion: 3, text: '{"format":"x"}' };
    expect(await transport.latest()).toEqual({ vaultVersion: 3, text: '{"format":"x"}' });
    expect(f.calls[0].init.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('reports a stale send as false, so the round merges and sends again', async () => {
    let status = 201;
    const f = fake(() => ({ status, body: status === 201 ? { vaultVersion: 2 } : { error: 'stale' } }));
    const transport = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch }).transport(token);

    expect(await transport.put({ vaultVersion: 2, text: 'v' }, 1)).toBe(true);
    expect(JSON.parse(f.calls[0].init.body!)).toEqual({ vaultVersion: 2, expectedVersion: 1, text: 'v' });
    status = 409;
    expect(await transport.put({ vaultVersion: 2, text: 'v' }, 1)).toBe(false);
    status = 400;
    expect((await refusal(transport.put({ vaultVersion: 2, text: 'v' }, 1))).status).toBe(400);
  });

  it('quotes a body it cannot parse instead of reporting a generic failure', async () => {
    const f = fake(() => ({ status: 502, body: '<html>Bad gateway</html>' }));
    const client = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch });
    expect((await refusal(client.transport(token).latest())).message).toContain('Bad gateway');
  });

  it('never sends a device id that could reach another route', async () => {
    const f = fake(() => ({ status: 200, body: { revoked: 'x' } }));
    const client = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch });
    await expect(client.revoke(token, '../../api/sync')).rejects.toThrow(/bloqueado/);
    expect(f.calls).toHaveLength(0);
  });

  it('sends nothing once the session is cancelled', async () => {
    const f = fake(() => ({ status: 204 }));
    const controller = new AbortController();
    controller.abort();
    const client = createVaultClient({ server: 'https://sync.example.com', fetch: f.fetch, signal: controller.signal });
    expect((await refusal(client.transport(token).latest())).message).toMatch(/cancelada/);
    expect(f.calls).toHaveLength(0);
  });

  it('says it could not reach the server when the network fails', async () => {
    const fetch: VaultFetch = async () => { throw new TypeError('Network request failed'); };
    const client = createVaultClient({ server: 'https://sync.example.com', fetch });
    expect((await refusal(client.transport(token).latest())).message).toMatch(/contactar/);
  });
});
