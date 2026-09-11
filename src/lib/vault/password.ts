import { scryptAsync } from "@noble/hashes/scrypt.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { equalBytes } from "@noble/ciphers/utils.js";

/**
 * Passwords for sync accounts.
 *
 * A password here opens an account, never a vault: the vault needs the seed,
 * which the server never sees. Someone who takes the password gets the ability to
 * download ciphertext and nothing else. It still deserves a slow hash, because
 * people reuse passwords and a leaked table of fast hashes is a list of their
 * other accounts.
 *
 * scrypt with N=2^15, r=8, p=3 — one of the configurations OWASP lists as
 * equivalent — through @noble/hashes rather than node:crypto, so this module has
 * no Node-only import and stays as pure as the rest of `src/lib`. The parameters
 * travel inside the stored string, so they can be raised later without
 * invalidating anyone's password: `needsRehash` says when to upgrade one at login.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 512;

const CURRENT = { logN: 15, r: 8, p: 3 } as const;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use a password of at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use a password of at most ${PASSWORD_MAX} characters.`;
  return null;
}

/**
 * The same password however a keyboard encoded it.
 *
 * "é" can arrive as one code point or as "e" plus a combining accent, and a phone
 * and a PC do not always agree. Hashed as typed, a correct Portuguese password
 * would fail on the other device and read as a wrong password.
 */
function normalised(password: string): string {
  return password.normalize("NFKC");
}

export async function hashPassword(
  password: string,
  random: (length: number) => Uint8Array | Promise<Uint8Array>
): Promise<string> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const salt = await random(SALT_BYTES);
  if (salt.length !== SALT_BYTES) {
    throw new Error(`The random source returned ${salt.length} bytes for a ${SALT_BYTES}-byte salt.`);
  }
  const hash = await scryptAsync(normalised(password), salt, {
    N: 2 ** CURRENT.logN, r: CURRENT.r, p: CURRENT.p, dkLen: HASH_BYTES,
  });
  return `scrypt$${CURRENT.logN}$${CURRENT.r}$${CURRENT.p}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

interface Parsed { logN: number; r: number; p: number; salt: Uint8Array; hash: Uint8Array }

/**
 * A stored hash, refused before any work if its parameters are out of range.
 *
 * The bounds matter even though the hashes are this app's own: a row with N=2^30
 * would make one login attempt consume the server, and the check costs nothing.
 */
function parse(stored: string): Parsed {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") throw new Error("Unrecognised password hash.");
  const [logN, r, p] = parts.slice(1, 4).map(Number);
  if (
    ![logN, r, p].every(Number.isInteger) ||
    logN < 14 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 8
  ) {
    throw new Error("Password hash parameters out of range.");
  }
  return { logN, r, p, salt: hexToBytes(parts[4]), hash: hexToBytes(parts[5]) };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const { logN, r, p, salt, hash } = parse(stored);
  if (password.length > PASSWORD_MAX) return false;
  const actual = await scryptAsync(normalised(password), salt, { N: 2 ** logN, r, p, dkLen: hash.length });
  return equalBytes(actual, hash);
}

/** True when a hash was made with weaker parameters than today's. */
export function needsRehash(stored: string): boolean {
  const { logN, r, p } = parse(stored);
  return logN !== CURRENT.logN || r !== CURRENT.r || p !== CURRENT.p;
}
