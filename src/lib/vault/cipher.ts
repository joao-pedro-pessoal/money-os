import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";

/**
 * The encrypted vault a server stores and cannot read.
 *
 * The construction is recorded in docs/PLANO_MOBILE.md, "Construção criptográfica
 * do cofre sincronizado". The short version, and the reason for each part:
 *
 * - **Key: HKDF-SHA256 over the seed's 128 bits.** Not PBKDF2 like the mobile
 *   backup: a slow function protects weak passwords, and random entropy is not
 *   weak. The label differs from the backup's, so neither key opens the other.
 * - **AES-256-GCM, a fresh random nonce per encryption.** Reusing a nonce under
 *   one key breaks GCM outright, so the nonce is never derived or remembered.
 * - **The user and the version are authenticated, not encrypted.** The server is
 *   not trusted. Without them it could hand one person's vault to another, or
 *   serve last month's version as the current one, and both would decrypt.
 *
 * Hex rather than base64 on the wire, because this runs in the browser as well as
 * on the phone and `Buffer` exists on neither. It costs size — twice the bytes
 * instead of four thirds — and `formatVersion` is what lets a later format change
 * that without breaking vaults already stored.
 *
 * Nothing here has had an independent review. The legal and security checklist
 * requires one before this holds anyone else's data.
 */

export const VAULT_FORMAT = "money-os-sync-vault";
const FORMAT_VERSION = 1;
const KEY_LABEL = "money-os-sync-vault:v1";
const ENTROPY_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** The same ceiling the mobile backup puts on a vault, so one can become the other. */
export const MAX_PLAINTEXT_BYTES = 20_000_000;
const MAX_CIPHERTEXT_HEX = (MAX_PLAINTEXT_BYTES + TAG_BYTES) * 2;
const MAX_ENVELOPE_CHARS = MAX_CIPHERTEXT_HEX + 1024;

/**
 * What an account id may look like.
 *
 * Restricted because it goes into the authenticated data joined by `|`: an id
 * that could contain the separator would let "a|1" and version 2 collide with
 * "a" and version "1|2". cuid2 and UUID both fit.
 */
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

const Envelope = z
  .object({
    format: z.literal(VAULT_FORMAT),
    formatVersion: z.literal(FORMAT_VERSION),
    userId: z.string().regex(USER_ID),
    vaultVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    nonce: z.string().length(NONCE_BYTES * 2),
    ciphertext: z.string().min(TAG_BYTES * 2).max(MAX_CIPHERTEXT_HEX),
  })
  .strict();

/**
 * Why a vault was refused, as something a screen can act on.
 *
 * GCM cannot tell a wrong key from altered bytes — both fail the same tag check —
 * so those two share a reason and the message says both. The other three are
 * decided before any key is derived, and each has a different remedy.
 */
export type VaultFailure = "format" | "other-account" | "rollback" | "key-or-damage";

export class VaultError extends Error {
  constructor(
    readonly reason: VaultFailure,
    message: string
  ) {
    super(message);
    this.name = "VaultError";
  }
}

/** The vault key for a seed's entropy. The caller clears it when done. */
export function deriveVaultKey(entropy: Uint8Array): Uint8Array {
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error(`A vault key needs ${ENTROPY_BYTES} bytes of seed entropy; got ${entropy.length}.`);
  }
  return hkdf(sha256, entropy, new Uint8Array(0), utf8ToBytes(KEY_LABEL), 32);
}

function authenticated(userId: string, vaultVersion: number): Uint8Array {
  return utf8ToBytes(`${KEY_LABEL}|${userId}|${vaultVersion}`);
}

/**
 * Hex that decodes, and decodes back to exactly what arrived.
 *
 * The round-trip check is the one the mobile backup makes on base64: an uppercase
 * or otherwise non-canonical encoding still decodes, and accepting two spellings
 * of the same bytes is how an envelope becomes malleable.
 */
function strictHex(value: string, what: string, expectedBytes?: number): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(value);
  } catch {
    throw new VaultError("format", `The vault's ${what} is not valid hex.`);
  }
  if (bytesToHex(bytes) !== value || (expectedBytes !== undefined && bytes.length !== expectedBytes)) {
    throw new VaultError("format", `The vault's ${what} is not in the expected encoding.`);
  }
  return bytes;
}

function assertUserId(userId: string): void {
  if (!USER_ID.test(userId)) throw new Error("An account id may use only letters, digits, - and _.");
}

export async function encryptVault(input: {
  plaintext: Uint8Array;
  entropy: Uint8Array;
  userId: string;
  /** Must be higher than every version already stored for this account. */
  vaultVersion: number;
  random: (length: number) => Uint8Array | Promise<Uint8Array>;
}): Promise<string> {
  assertUserId(input.userId);
  if (!Number.isSafeInteger(input.vaultVersion) || input.vaultVersion < 1) {
    throw new Error("A vault version is a whole number from 1 upwards.");
  }
  if (input.plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new Error("The vault is larger than this version supports.");
  }
  const nonce = await input.random(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) {
    throw new Error(`The random source returned ${nonce.length} bytes for a ${NONCE_BYTES}-byte nonce.`);
  }

  const key = deriveVaultKey(input.entropy);
  try {
    const ciphertext = gcm(key, nonce, authenticated(input.userId, input.vaultVersion)).encrypt(
      input.plaintext
    );
    return JSON.stringify({
      format: VAULT_FORMAT,
      formatVersion: FORMAT_VERSION,
      userId: input.userId,
      vaultVersion: input.vaultVersion,
      nonce: bytesToHex(nonce),
      ciphertext: bytesToHex(ciphertext),
    });
  } finally {
    key.fill(0);
  }
}

/**
 * Opens a vault the server returned, or says why it will not.
 *
 * The authenticated data is built from the account this device **expects** and
 * the version the envelope **claims**. So a server that relabels a vault's owner
 * or version fails the tag rather than being believed, and one that serves a
 * genuine older version is refused by `minVaultVersion` before decryption.
 *
 * Equal to `minVaultVersion` is accepted: receiving the version you already have
 * is not a rollback. Two different vaults under one version number would be — and
 * preventing that is the job of the sync layer that assigns version numbers.
 *
 * The caller owns the returned plaintext and should clear it once it is parsed.
 */
export function decryptVault(input: {
  text: string;
  entropy: Uint8Array;
  userId: string;
  /** The highest version this device has already accepted; 0 on a new device. */
  minVaultVersion: number;
}): { plaintext: Uint8Array; vaultVersion: number } {
  assertUserId(input.userId);
  if (!Number.isSafeInteger(input.minVaultVersion) || input.minVaultVersion < 0) {
    throw new Error("The last accepted vault version is a whole number from 0 upwards.");
  }
  const env = parseEnvelope(input.text);
  if (env.userId !== input.userId) {
    throw new VaultError("other-account", "This vault belongs to a different account.");
  }
  if (env.vaultVersion < input.minVaultVersion) {
    throw new VaultError(
      "rollback",
      `The server returned version ${env.vaultVersion}, older than the version ${input.minVaultVersion} this device already has.`
    );
  }

  const key = deriveVaultKey(input.entropy);
  try {
    const plaintext = gcm(key, env.nonce, authenticated(input.userId, env.vaultVersion)).decrypt(env.ciphertext);
    return { plaintext, vaultVersion: env.vaultVersion };
  } catch {
    throw new VaultError(
      "key-or-damage",
      "Wrong recovery seed, or the vault was altered or damaged. Nothing on this device was changed."
    );
  } finally {
    key.fill(0);
  }
}

/**
 * The envelope checked for size, shape and canonical encoding, not decrypted.
 *
 * One reader for both ends of the wire: the device before decrypting and the
 * server before storing. A server validating envelopes by rules of its own would
 * accept vaults the devices then refuse, and nobody would find out until a phone
 * could not open its own data.
 */
function parseEnvelope(text: string): {
  userId: string;
  vaultVersion: number;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
} {
  if (text.length > MAX_ENVELOPE_CHARS) {
    throw new VaultError("format", "This vault is larger than this version supports.");
  }
  let env: z.infer<typeof Envelope>;
  try {
    env = Envelope.parse(JSON.parse(text));
  } catch {
    throw new VaultError("format", "This is not a Money OS sync vault this version can read.");
  }
  return {
    userId: env.userId,
    vaultVersion: env.vaultVersion,
    nonce: strictHex(env.nonce, "nonce", NONCE_BYTES),
    ciphertext: strictHex(env.ciphertext, "ciphertext"),
  };
}

/**
 * Whose vault this claims to be and which version it claims to be: everything a
 * server can check without the seed.
 *
 * Claims, not facts — only decryption proves them. What checking them buys a
 * server is refusing to store a vault labelled for another account or another
 * version, which would otherwise sit there until a device failed to open it.
 */
export function readVaultHeader(text: string): { userId: string; vaultVersion: number } {
  const { userId, vaultVersion } = parseEnvelope(text);
  return { userId, vaultVersion };
}
