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
  if (!masterKey || masterKey.length < 16) {
    throw new Error("ENCRYPTION_KEY must be at least 16 characters");
  }
  return createHash("sha256").update(masterKey).digest();
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
