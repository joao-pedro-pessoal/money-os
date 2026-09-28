import { gcm } from "@noble/ciphers/aes.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";
import { deviceName } from "./protocol";
import { isValidSeed, normaliseSeed } from "./seed";

/**
 * Opening a vault on a phone by scanning a code on a device already signed in.
 *
 * The code is an address: `/vault/link#<id>.<key>`. Everything after `#` is the
 * fragment, which a browser keeps to itself — it is not sent in the request, so
 * it reaches no server, no proxy and no log. The key there seals the twelve
 * words; the server holds only what it sealed, under the id, for a few minutes.
 *
 * Seeing the code is not enough to get in. The phone that scans it asks, with
 * its name and a secret of its own; the device showing the code says yes or no
 * to that name; only then is the sealed words and a session handed over, and
 * only to whoever holds the phone's secret. A photograph of the screen gets its
 * holder a question on the owner's screen, not a vault.
 */

/** How long a code lasts. Long enough to find the phone, short enough to be worthless later. */
export const LINK_SECONDS = 5 * 60;
/** How often both sides ask how it is going. */
export const LINK_POLL_MS = 2000;

const LABEL = utf8ToBytes("money-os-device-link:v1");
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const FORMAT = "v1";

export class LinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkError";
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** 16 random bytes, as the server issues them. */
const LINK_ID = /^[A-Za-z0-9_-]{22}$/;
/** 32 random bytes, as the page makes them. */
const KEY_TEXT = /^[A-Za-z0-9_-]{43}$/;

export function isLinkId(value: string): boolean {
  return LINK_ID.test(value);
}

/** A fresh key, for the code or for the phone's own claim. */
export function newLinkKey(random: (n: number) => Uint8Array): string {
  return toBase64Url(random(KEY_BYTES));
}

/** What the server keeps instead of the phone's claim key: enough to check it, not to use it. */
export function claimHashOf(claimKey: string): string {
  return bytesToHex(sha256(utf8ToBytes(claimKey)));
}

/** The twelve words, sealed under the code's key. */
export function sealSeed(seed: string, key: string, random: (n: number) => Uint8Array): string {
  if (!isValidSeed(seed)) throw new LinkError("Those are not the twelve words of a recovery seed.");
  if (!KEY_TEXT.test(key)) throw new LinkError("That is not a link key.");
  const nonce = random(NONCE_BYTES);
  const sealed = gcm(fromBase64Url(key), nonce, LABEL).encrypt(utf8ToBytes(normaliseSeed(seed)));
  return `${FORMAT}.${bytesToHex(nonce)}.${bytesToHex(sealed)}`;
}

/** The twelve words back, or a refusal that says the code was wrong — never wrong words. */
export function openSeed(sealed: string, key: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== FORMAT || !KEY_TEXT.test(key)) {
    throw new LinkError("This code does not match what the computer sent. Show a new one.");
  }
  let words: string;
  try {
    const opened = gcm(fromBase64Url(key), hexToBytes(parts[1]), LABEL).decrypt(hexToBytes(parts[2]));
    words = new TextDecoder().decode(opened);
  } catch {
    throw new LinkError("This code does not match what the computer sent. Show a new one.");
  }
  if (!isValidSeed(words)) throw new LinkError("This code does not match what the computer sent. Show a new one.");
  return words;
}

/** The address the code shows. The key rides in the fragment, which is never sent. */
export function linkAddress(origin: string, id: string, key: string): string {
  return `${origin.replace(/\/+$/, "")}/vault/link#${id}.${key}`;
}

/** The id and key from a scanned address's fragment, or null when it holds neither. */
export function readLinkFragment(hash: string): { id: string; key: string } | null {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  const [id, key, ...rest] = text.split(".");
  if (rest.length > 0 || !id || !key || !isLinkId(id) || !KEY_TEXT.test(key)) return null;
  return { id, key };
}

/**
 * Whether a phone could open this origin at all.
 *
 * A computer that opened the site as `localhost` would put `localhost` in the
 * code, and on the phone that means the phone itself. Better to say so than to
 * show a code that leads nowhere.
 */
export function unreachableFromPhone(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return true;
  }
  return host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\./.test(host);
}

export type LinkState = "waiting" | "asked" | "approved" | "collected" | "expired";

/** Where a code stands. Collected is final; anything else past its minutes is over. */
export function linkState(row: { state: string; expiresAt: Date }, now: Date): LinkState {
  if (row.state === "collected") return "collected";
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.state === "asked" || row.state === "approved") return row.state;
  return "waiting";
}

/**
 * A readable name for a device, from its user agent.
 *
 * The owner decides on this name whether a phone may in, so it has to be
 * something a person recognises — "Android phone · Chrome", not the first
 * sixty characters of "Mozilla/5.0 (Linux; Android 10; K)".
 */
export function describeDevice(userAgent: string): string {
  const ua = userAgent;
  const kind = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? "Android phone"
          : "Android tablet"
        : /CrOS/.test(ua)
          ? "Chromebook"
          : /Windows/.test(ua)
            ? "Windows computer"
            : /Macintosh|Mac OS X/.test(ua)
              ? "Mac"
              : /Linux/.test(ua)
                ? "Linux computer"
                : "Device";
  const browser = /EdgA?\/|EdgiOS/.test(ua)
    ? "Edge"
    : /OPR\/|OPiOS/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : null;
  return browser ? `${kind} · ${browser}` : kind;
}

// What the server accepts — decided here, without a database, like the rest of the protocol.

export const CreateLinkRequest = z
  .object({ sealed: z.string().max(512).regex(/^v1\.[0-9a-f]{24}\.[0-9a-f]{2,400}$/) })
  .strict();

export const AskLinkRequest = z
  .object({ deviceName, claimHash: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();

export const CollectLinkRequest = z.object({ claimKey: z.string().regex(KEY_TEXT) }).strict();

export const AnswerLinkRequest = z.object({ allow: z.boolean() }).strict();
