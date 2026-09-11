import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/**
 * Session tokens for devices talking to the sync server.
 *
 * A bearer token rather than the site's cookie, because the phone is not a browser
 * and the site's cookie proves only that someone knows the single-user password —
 * it names no account at all.
 *
 * The server stores a SHA-256 of the token, never the token. A fast hash is enough
 * here and a slow one would be waste: 256 random bits cannot be guessed, so what
 * hashing buys is only that a copy of the sessions table cannot be replayed as
 * logins.
 */

const TOKEN_BYTES = 32;
const TOKEN = /^[0-9a-f]{64}$/;

/** How long a device stays signed in without using the account. */
export const SESSION_DAYS = 90;

export async function newSessionToken(
  random: (length: number) => Uint8Array | Promise<Uint8Array>
): Promise<{ token: string; tokenHash: string }> {
  const bytes = await random(TOKEN_BYTES);
  if (bytes.length !== TOKEN_BYTES) {
    throw new Error(`The random source returned ${bytes.length} bytes for a ${TOKEN_BYTES}-byte token.`);
  }
  try {
    const token = bytesToHex(bytes);
    return { token, tokenHash: hashSessionToken(token) };
  } finally {
    bytes.fill(0);
  }
}

export function hashSessionToken(token: string): string {
  if (!TOKEN.test(token)) throw new Error("Malformed session token.");
  return bytesToHex(sha256(utf8ToBytes(token)));
}

/**
 * The token from an Authorization header, or null.
 *
 * Exactly one well-formed token or nothing: a header that almost matches is not a
 * partial credential to try. The scheme name is case-insensitive, as HTTP defines it.
 */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^bearer ([0-9a-f]{64})$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * When a session made at `now` stops working.
 *
 * A duration in milliseconds, not a count of calendar days — a session lasting 90
 * × 24 hours regardless of a clock change is the intended behaviour, which is why
 * this does not use the calendar arithmetic the rest of the app requires for days.
 */
export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}
