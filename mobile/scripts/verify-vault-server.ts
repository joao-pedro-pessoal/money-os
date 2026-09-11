/**
 * End to end: two phones syncing through the real sync server.
 *
 *   npx tsx mobile/scripts/verify-vault-server.ts [server]
 *
 * Runs from the repository root against a server that is already running — the
 * local preview by default, http://127.0.0.1:3000 — using the same client, sync
 * round, seed and cipher the phone uses. Nothing is mocked: every request crosses
 * HTTP into the route, the action and Postgres, and every vault that comes back
 * is decrypted here.
 *
 * It creates throwaway accounts with a timestamped address and leaves them in the
 * database. Against anything but a disposable local database, don't.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { generateSeed, seedEntropy } from '../../src/lib/vault/seed';
import { encryptVault } from '../../src/lib/vault/cipher';
import { createVaultClient, VaultServerError, type VaultFetch } from '../src/services/vault-client';
import { syncVault, type SyncOutcome } from '../src/domain/sync';
import { recordCash } from '../src/domain/operations';
import { emptyState, validateState, type LocalEvent, type LocalState } from '../src/domain/model';
import { units } from '../src/domain/money';

const server = process.argv[2] ?? 'http://127.0.0.1:3000';
const random = (n: number) => new Uint8Array(randomBytes(n));
const client = createVaultClient({ server, fetch: fetch as unknown as VaultFetch });

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? `\n        ${detail}` : ''}`);
}

async function refusedWith(promise: Promise<unknown>): Promise<number | null> {
  try { await promise; return null; } catch (e) { if (e instanceof VaultServerError) return e.status; throw e; }
}

function cash(accountId: string, amount: string): LocalEvent {
  return {
    id: randomUUID(), accountId, date: new Date().toISOString(),
    type: units(amount) < 0n ? 'EXPENSE' : 'INCOME', amount, currency: 'EUR',
    description: '', symbol: '', quantity: null, price: null, fees: null,
    source: 'manual', externalId: '', transferId: null,
  };
}

interface Phone { userId: string; token: string; base: LocalState; baseVersion: number; local: LocalState }

async function sync(phone: Phone, entropy: Uint8Array): Promise<SyncOutcome> {
  const outcome = await syncVault({
    userId: phone.userId, entropy, baseVersion: phone.baseVersion, base: phone.base, local: phone.local,
    transport: client.transport(phone.token), random,
  });
  if ('local' in outcome) {
    phone.local = validateState(outcome.local);
    phone.base = outcome.base;
    phone.baseVersion = outcome.version;
  }
  return outcome;
}

const balanceOf = (p: Phone, id: string) => p.local.accounts.find(a => a.id === id)?.balance;

async function main() {
  console.log(`Sync server end to end against ${server}\n`);
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'uma frase suficientemente longa';
  const entropy = seedEntropy(await generateSeed(random));

  console.log('Accounts');
  const a = await client.register({ email, password, deviceName: 'Phone A' });
  check('registers an account and signs the first device in', /^[0-9a-f]{64}$/.test(a.token));
  check('refuses a second account for the same address', (await refusedWith(client.register({ email, password, deviceName: 'x' }))) === 409);
  check('refuses a wrong password', (await refusedWith(client.login({ email, password: `${password}!`, deviceName: 'x' }))) === 401);
  const b = await client.login({ email: email.toUpperCase(), password, deviceName: 'Phone B' });
  check('signs a second device into the same account, whatever the address case', b.userId === a.userId && b.deviceId !== a.deviceId);

  console.log('\nSync');
  const account = {
    id: randomUUID(), name: 'Conta', currency: 'EUR', balance: '100', platform: null,
    credentialRef: null, reading: null, syncedAt: null, createdAt: new Date().toISOString(),
  };
  const phoneA: Phone = { ...a, base: emptyState(), baseVersion: 0, local: { ...emptyState(), accounts: [account] } };
  const phoneB: Phone = { ...b, base: emptyState(), baseVersion: 0, local: emptyState() };

  check('a new account has no vault yet', (await client.transport(a.token).latest()) === null);
  check('phone A sends the first vault', (await sync(phoneA, entropy)).status === 'pushed');
  check('phone B receives it', (await sync(phoneB, entropy)).status === 'pulled' && balanceOf(phoneB, account.id) === '100');

  recordCash(phoneA.local, cash(account.id, '50'));
  check('phone A sends a movement', (await sync(phoneA, entropy)).status === 'pushed');
  recordCash(phoneB.local, cash(account.id, '-20'));
  const merged = await sync(phoneB, entropy);
  check('phone B merges its own movement with A\'s', merged.status === 'merged' && balanceOf(phoneB, account.id) === '130',
    JSON.stringify(merged).slice(0, 300));
  check('phone A receives the merge, and the balance counts both movements once',
    (await sync(phoneA, entropy)).status === 'pulled' && balanceOf(phoneA, account.id) === '130');

  const latest = await client.transport(a.token).latest();
  check('the server stored three versions', latest?.vaultVersion === 3);
  /**
   * What the server holds, checked by its shape rather than by searching for the
   * balance. The first version of this check looked for "130" and failed on a
   * correct vault: a balance's digits turn up by chance in any long hex string.
   * The account id carries hyphens and the name capitals, and lowercase hex can
   * contain neither.
   */
  const envelope = latest === null ? null : JSON.parse(latest.text);
  check('the server holds ciphertext, not the vault',
    envelope !== null &&
      Object.keys(envelope).sort().join(',') === 'ciphertext,format,formatVersion,nonce,userId,vaultVersion' &&
      /^[0-9a-f]+$/.test(envelope.ciphertext) &&
      !latest!.text.includes(account.id) && !latest!.text.includes('Conta'),
    latest?.text.slice(0, 200));

  console.log('\nRefusals');
  // A properly sealed version 2, sent as though version 1 were still the newest.
  // Sending version 3's vault labelled as 2 is a different refusal — see below.
  const sealedAsTwo = await encryptVault({
    plaintext: new TextEncoder().encode(JSON.stringify(emptyState())), entropy, userId: a.userId, vaultVersion: 2, random,
  });
  check('a stale send is answered as stale, not stored',
    (await client.transport(a.token).put({ vaultVersion: 2, text: sealedAsTwo }, 1)) === false);
  check('a vault whose own version disagrees with the request is refused as malformed',
    (await refusedWith(client.transport(a.token).put({ vaultVersion: 4, text: sealedAsTwo }, 3))) === 400);

  const c = await client.register({ email: `e2e-other-${Date.now()}@example.com`, password, deviceName: 'Other' });
  const sealedForA = await encryptVault({
    plaintext: new TextEncoder().encode(JSON.stringify(emptyState())), entropy, userId: a.userId, vaultVersion: 1, random,
  });
  check('another account cannot store a vault sealed for this one',
    (await refusedWith(client.transport(c.token).put({ vaultVersion: 1, text: sealedForA }, 0))) === 403);
  check('another account sees none of this one\'s vaults', (await client.transport(c.token).latest()) === null);
  check('a made-up token is refused', (await refusedWith(client.transport('b'.repeat(64)).latest())) === 401);

  console.log('\nDevices');
  const devices = await client.devices(a.token);
  check('the account lists both devices and marks this one', devices.length === 2 && devices.filter(d => d.current).length === 1);
  await client.revoke(a.token, b.deviceId);
  check('a revoked device is no longer served', (await refusedWith(client.transport(b.token).latest())) === 401);
  check('the device that revoked it still is', (await client.transport(a.token).latest())?.vaultVersion === 3);

  console.log('\nRepeated wrong passwords');
  const otherEmail = `e2e-lock-${Date.now()}@example.com`;
  await client.register({ email: otherEmail, password, deviceName: 'Locked' });
  const statuses: (number | null)[] = [];
  for (let i = 0; i < 11; i++) statuses.push(await refusedWith(client.login({ email: otherEmail, password: 'wrong password!', deviceName: 'x' })));
  check('ten wrong passwords are each refused', statuses.slice(0, 10).every(s => s === 401), statuses.join(','));
  check('the eleventh attempt is locked out', statuses[10] === 429, String(statuses[10]));
  check('even the right password waits out the lock',
    (await refusedWith(client.login({ email: otherEmail, password, deviceName: 'x' }))) === 429);

  console.log(`\n${failures === 0 ? 'Every check passed.' : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
