import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { Buffer } from 'buffer';
import { z } from 'zod';
import { validateState, type LocalState } from './model';

const ITERATIONS = 600000;
const MAX_BYTES = 30000000;
const header = new TextEncoder().encode('money-os-local-backup:v1');
const Envelope = z.object({
  format: z.literal('money-os-local-backup'), version: z.literal(1),
  kdf: z.literal('PBKDF2-SHA256'), iterations: z.literal(ITERATIONS),
  salt: z.string().max(64), nonce: z.string().max(64), ciphertext: z.string().max(MAX_BYTES),
}).strict();
function bytes(value: string, expected?: number): Uint8Array {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || (expected && decoded.length !== expected))
    throw new Error('Backup inválido.');
  return decoded;
}
export async function encryptBackup(state: LocalState, password: string,
  random: (length: number) => Promise<Uint8Array>): Promise<string> {
  if (password.length < 12 || password.length > 512) throw new Error('Usa uma palavra-passe entre 12 e 512 caracteres.');
  const clean = validateState(state);
  // No reference can silently reconnect to an older Keychain item after restore.
  clean.accounts = clean.accounts.map(account => ({ ...account, credentialRef: null }));
  const plain = new TextEncoder().encode(JSON.stringify(clean));
  if (plain.length > 20000000) throw new Error('O cofre excede o tamanho suportado por esta versão.');
  const salt = await random(16);
  const nonce = await random(12);
  const key = await pbkdf2Async(sha256, password, salt, { c: ITERATIONS, dkLen: 32, asyncTick: 10 });
  try {
    return JSON.stringify({ format: 'money-os-local-backup', version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS,
      salt: Buffer.from(salt).toString('base64'), nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(gcm(key, nonce, header).encrypt(plain)).toString('base64') });
  } finally { key.fill(0); plain.fill(0); }
}
export async function decryptBackup(text: string, password: string): Promise<LocalState> {
  if (text.length > MAX_BYTES || password.length < 12 || password.length > 512) throw new Error('Backup ou palavra-passe inválidos.');
  let env: z.infer<typeof Envelope>;
  try { env = Envelope.parse(JSON.parse(text)); } catch { throw new Error('Escolhe um backup cifrado da app móvel Money OS (.moneyos).'); }
  const salt = bytes(env.salt, 16);
  const nonce = bytes(env.nonce, 12);
  const ciphertext = bytes(env.ciphertext);
  const key = await pbkdf2Async(sha256, password, salt, { c: ITERATIONS, dkLen: 32, asyncTick: 10 });
  let plain: Uint8Array | undefined;
  try {
    plain = gcm(key, nonce, header).decrypt(ciphertext);
    const state = validateState(JSON.parse(new TextDecoder().decode(plain)));
    state.accounts = state.accounts.map(account => ({ ...account, credentialRef: null }));
    return state;
  } catch { throw new Error('Palavra-passe incorreta ou backup danificado. Os dados atuais foram mantidos.'); }
  finally { key.fill(0); plain?.fill(0); }
}
