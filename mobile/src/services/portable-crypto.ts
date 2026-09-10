// Narrow Node-crypto adapter for the EXISTING connector signing functions.
// No network, no RNG polyfill, no Node runtime in the mobile bundle.
import { Buffer } from 'buffer';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';

type Encoding = 'hex' | 'base64';
function hashFor(algorithm: string) {
  if (algorithm === 'sha256') return sha256;
  if (algorithm === 'sha512') return sha512;
  throw new Error('Unsupported signing algorithm');
}
function bytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
}
interface StreamingHash { update(data: Uint8Array): unknown; digest(): Uint8Array; }
interface PortableHash {
  update(data: string | Uint8Array): PortableHash;
  digest(): Buffer;
  digest(encoding: Encoding): string;
}
function wrap(hash: StreamingHash): PortableHash {
  return {
    update(data: string | Uint8Array) { hash.update(bytes(data)); return this; },
    digest(encoding?: Encoding) {
      const result = Buffer.from(hash.digest());
      return encoding ? result.toString(encoding) : result;
    },
  } as PortableHash;
}
export function createHash(algorithm: string) { return wrap(hashFor(algorithm).create()); }
export function createHmac(algorithm: string, key: string | Uint8Array) {
  return wrap(hmac.create(hashFor(algorithm), bytes(key)));
}
