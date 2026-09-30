import { equalBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Signing in without the server ever receiving the password.
 *
 * The page turns the email and password into a **sign-in key** with a slow
 * scrypt, and sends that instead; the server keeps a slow hash of the key. So
 * the password is never in a request, a log or a database — not ours, not a
 * backup's — and a leaked table is guessed at one scrypt and one more hash per
 * attempt.
 *
 * The email is the salt: every account gets a different one, and the page can
 * derive the key before the server has said anything about the account.
 *
 * The labels below are fixed forever. Every stored hash is of a key made with
 * them, and a changed label would sign everyone out of their account for good.
 */

/** The form of an email every comparison and every key uses. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** scrypt at 64 MiB — about a second on a phone. Fixed: the page must know it before asking anything. */
export const SIGN_IN_KDF = { logN: 16, r: 8, p: 1 } as const;

const SALT_LABEL = "money-os-vault-sign-in:v1|";
const AUTH_LABEL = utf8ToBytes("money-os-vault-sign-in-key:v1");

/** A sign-in key or a hash: 32 bytes as lowercase hex. */
export const KEY_HEX = /^[0-9a-f]{64}$/;

export class CredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialError";
  }
}

/** The key the page sends for this email and password, in place of the password. */
export async function signInKeyFor(email: string, password: string): Promise<string> {
  const master = await scryptAsync(
    utf8ToBytes(password.normalize("NFKC")),
    utf8ToBytes(SALT_LABEL + normalizeEmail(email)),
    { N: 2 ** SIGN_IN_KDF.logN, r: SIGN_IN_KDF.r, p: SIGN_IN_KDF.p, dkLen: 32 }
  );
  try {
    return bytesToHex(hkdf(sha256, master, undefined, AUTH_LABEL, 32));
  } finally {
    master.fill(0);
  }
}

/** Two keys in hex, compared without saying how much of them matched. */
export function sameKey(a: string, b: string): boolean {
  return KEY_HEX.test(a) && KEY_HEX.test(b) && equalBytes(hexToBytes(a), hexToBytes(b));
}

/*
 * The recovery code: shown once when an account is made, the one way to set a
 * new password without the old one. 20 characters from 31 that cannot be
 * mistaken for each other — about 99 bits — in four groups to copy down.
 * High entropy, so the server keeps a plain sha256 of it: a slow hash guards
 * guessable secrets, and this is not one.
 */
const RECOVERY_LETTERS = "abcdefghjkmnpqrstuvwxyz23456789";

export function newRecoveryCode(random: (n: number) => Uint8Array): string {
  const letters: string[] = [];
  while (letters.length < 20) {
    for (const byte of random(32)) {
      // Rejection keeps every letter equally likely: 248 is 8 × 31.
      if (byte < 248 && letters.length < 20) letters.push(RECOVERY_LETTERS[byte % 31]);
    }
  }
  return [0, 5, 10, 15].map((i) => letters.slice(i, i + 5).join("")).join("-");
}

/** The code as someone types it back: any case, spaces or dashes. */
export function normaliseRecoveryCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function recoveryHashOf(code: string): string {
  const normalised = normaliseRecoveryCode(code);
  if (normalised.length !== 20 || [...normalised].some((c) => !RECOVERY_LETTERS.includes(c))) {
    throw new CredentialError("That is not a recovery code.");
  }
  return bytesToHex(sha256(utf8ToBytes(normalised)));
}
