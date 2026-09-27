/**
 * Encryption for API secrets at rest.
 *
 * PRODUCT_VISION §7 and TECH_STACK §5: API keys and secrets are never stored in
 * plaintext. Hyperliquid needed none — its read endpoint is public — but Bybit,
 * Trading 212 and IBKR all require credentials, so this is where that promise
 * gets enforced rather than merely stated.
 *
 * AES-256-GCM via Node's crypto: authenticated, so a tampered ciphertext fails
 * to decrypt instead of silently returning wrong bytes. The master key lives in
 * the environment, never in the database — someone who dumps the database still
 * cannot read the secrets.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, the standard for GCM
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from whatever the environment provides.
 *
 * Hashing means any passphrase length works, but it is NOT a password-strength
 * KDF — the master key is expected to be long random text, not a memorable
 * word. The setup docs say so explicitly.
 */
export function deriveKey(masterKey: string): Buffer {
  if (!holdsMasterKey(masterKey)) {
    throw new Error("ENCRYPTION_KEY must be at least 16 characters");
  }
  return createHash("sha256").update(masterKey).digest();
}

/**
 * Whether this copy of the app holds a key that opens stored secrets.
 *
 * Not every copy should. The one at home has it in `.env`. A copy on a hosting
 * service runs without it on purpose (docs/FORA_DE_CASA.md): the database it
 * shares holds the secrets encrypted, and the service is never given what opens
 * them. The same test `deriveKey` applies, so "holds a key" means "a key
 * `deriveKey` would accept".
 */
export function holdsMasterKey(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 16;
}

/**
 * Whether a stored connection carries something this copy cannot open.
 *
 * That is not a broken connection — it works wherever the key is — so a sync
 * here is skipped rather than recorded as a failure. Recording it would mark
 * the connection as failing in the database every copy shares, and the copy
 * at home, where it syncs fine, would show an error that is not its own.
 */
export function secretLockedHere(
  stored: { encryptedSecret: string | null; encryptedPassphrase: string | null },
  masterKey: string | undefined
): boolean {
  return (stored.encryptedSecret !== null || stored.encryptedPassphrase !== null) && !holdsMasterKey(masterKey);
}

/**
 * Returns "iv:tag:ciphertext", all base64. A fresh IV every time, so encrypting
 * the same secret twice never produces the same output.
 */
export function encryptSecret(plaintext: string, masterKey: string): string {
  const key = deriveKey(masterKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string, masterKey: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Stored secret is malformed");
  }

  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("Stored secret is malformed");
  }

  const decipher = createDecipheriv(ALGORITHM, deriveKey(masterKey), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // GCM rejects both a wrong key and tampered data; the caller can't tell
    // them apart and shouldn't be told which, either.
    throw new Error("Could not decrypt — wrong encryption key, or the stored value was altered");
  }
}

/**
 * A safe thing to show on screen: last four characters only.
 * Never render a key itself, even partially at the start — the prefix of an
 * API key is often enough to identify the account.
 */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

/** Constant-time comparison, for secrets that are checked rather than decrypted. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
