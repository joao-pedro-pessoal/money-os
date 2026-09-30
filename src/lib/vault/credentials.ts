import { gcm } from "@noble/ciphers/aes.js";
import { equalBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { normalizeEmail } from "../signInRoute";
import { isValidSeed, normaliseSeed, seedEntropy } from "./seed";

/**
 * Signing in to a vault with an email and a password alone.
 *
 * The twelve words are still the key to the vault; what changed is who carries
 * them. The server keeps them sealed, and only the password can unseal them —
 * but the password itself never reaches the server, or the server could unseal
 * them too. So the page turns it into two keys first, with a deliberately slow
 * scrypt:
 *
 *  - the **sign-in key** is what the server checks, where it used to check the
 *    password. It proves the password without being it.
 *  - the **seal key** unseals the twelve words, and never leaves the page.
 *
 * Both come out of one scrypt through HKDF with different labels, so knowing
 * the first says nothing about the second. What the server holds — a hash of
 * the sign-in key and the sealed words — can only be opened by guessing the
 * password, one slow scrypt per guess. That is the price of not typing twelve
 * words: a weak password is now what stands between the database and a vault.
 *
 * The email is the salt: every account gets a different one, and a page can
 * derive the keys before the server has said anything about the account —
 * nothing to ask first, so nothing to learn from asking.
 *
 * The words keep one more job. A recovery key derived from them, and only its
 * hash on the server, lets someone who forgot the password set a new one. The
 * server never sees the words for that either.
 */

/** scrypt at 64 MiB. Fixed by the version: the page must know it before it asks the server anything. */
export const SIGN_IN_KDF = { logN: 16, r: 8, p: 1 } as const;

const SALT_LABEL = "money-os-vault-sign-in:v1|";
const AUTH_LABEL = utf8ToBytes("money-os-vault-sign-in-key:v1");
const SEAL_LABEL = utf8ToBytes("money-os-vault-seed-seal:v1");
const RECOVERY_LABEL = utf8ToBytes("money-os-vault-recovery:v1");
const SEAL_FORMAT = "seal1";
const NONCE_BYTES = 12;

/** A sign-in key, a recovery key or the hash of one: 32 bytes as lowercase hex. */
export const KEY_HEX = /^[0-9a-f]{64}$/;
/** The twelve words sealed: a nonce and at most a few hundred bytes of ciphertext. */
export const SEALED_WORDS = /^seal1\.[0-9a-f]{24}\.[0-9a-f]{64,800}$/;

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

export interface PasswordKeys {
  /** Sent to the server in place of the password. */
  signInKey: string;
  /** Unseals the twelve words. Stays in the page; the caller clears it when done. */
  sealKey: Uint8Array;
}

/**
 * The two keys for an email and a password. Takes a moment on purpose — about
 * a second on a phone — and yields to the page while it works.
 */
export async function passwordKeys(email: string, password: string): Promise<PasswordKeys> {
  const master = await scryptAsync(
    utf8ToBytes(password.normalize("NFKC")),
    utf8ToBytes(SALT_LABEL + normalizeEmail(email)),
    { N: 2 ** SIGN_IN_KDF.logN, r: SIGN_IN_KDF.r, p: SIGN_IN_KDF.p, dkLen: 32 }
  );
  try {
    return {
      signInKey: bytesToHex(hkdf(sha256, master, undefined, AUTH_LABEL, 32)),
      sealKey: hkdf(sha256, master, undefined, SEAL_LABEL, 32),
    };
  } finally {
    master.fill(0);
  }
}

/** The twelve words sealed under the seal key, for the server to keep. */
export function sealWords(words: string, sealKey: Uint8Array, random: (n: number) => Uint8Array): string {
  if (!isValidSeed(words)) throw new CredentialError("Those are not the twelve words of a recovery seed.");
  const nonce = random(NONCE_BYTES);
  const sealed = gcm(sealKey, nonce, SEAL_LABEL).encrypt(utf8ToBytes(normaliseSeed(words)));
  return `${SEAL_FORMAT}.${bytesToHex(nonce)}.${bytesToHex(sealed)}`;
}

/** The twelve words back, or a refusal: a wrong key never yields wrong words. */
export function unsealWords(sealed: string, sealKey: Uint8Array): string {
  const refused = () => new CredentialError("The password signed in, but did not open the vault's words.");
  if (!SEALED_WORDS.test(sealed)) throw refused();
  const [, nonce, ciphertext] = sealed.split(".");
  let words: string;
  try {
    words = new TextDecoder().decode(gcm(sealKey, hexToBytes(nonce), SEAL_LABEL).decrypt(hexToBytes(ciphertext)));
  } catch {
    throw refused();
  }
  if (!isValidSeed(words)) throw refused();
  return words;
}

/**
 * What proves the twelve words to the server when the password is forgotten.
 * Derived under its own label, so it opens nothing: not the vault, not the words.
 */
export function recoveryKeyOf(words: string): string {
  const entropy = seedEntropy(words);
  try {
    return bytesToHex(hkdf(sha256, entropy, undefined, RECOVERY_LABEL, 32));
  } finally {
    entropy.fill(0);
  }
}

/** What the server keeps of the recovery key: enough to check one, not to be one. */
export function recoveryHashOf(recoveryKey: string): string {
  if (!KEY_HEX.test(recoveryKey)) throw new CredentialError("That is not a recovery key.");
  return bytesToHex(sha256(hexToBytes(recoveryKey)));
}

/** Two keys in hex, compared without saying how much of them matched. */
export function sameKey(a: string, b: string): boolean {
  return KEY_HEX.test(a) && KEY_HEX.test(b) && equalBytes(hexToBytes(a), hexToBytes(b));
}
