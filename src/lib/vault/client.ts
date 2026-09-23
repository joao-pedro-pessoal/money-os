/**
 * The browser's side of the vault: sign in, open, save.
 *
 * Everything that can read your money happens here, in the page, on your own
 * device. What crosses the network is a token and ciphertext — the recovery
 * seed, the key derived from it and the decrypted document never leave.
 *
 * The transport is injected rather than imported so this can be exercised
 * against a fake server with real cryptography, which is the only way to test
 * the part that matters: that what one device wrote, another can read, and that
 * a wrong seed reads nothing at all.
 */

import { decryptVault, encryptVault } from "./cipher";
import { readDocument, type VaultDocument } from "./document";
import { seedEntropy } from "./seed";

export interface VaultReply {
  status: number;
  body: unknown;
}

/** One call to the vault server: the method, the path, a token and a body. */
export type VaultTransport = (
  method: "GET" | "POST" | "PUT",
  path: string,
  init: { token?: string; body?: unknown }
) => Promise<VaultReply>;

export interface VaultSession {
  token: string;
  userId: string;
  deviceId: string;
}

export class VaultClientError extends Error {
  constructor(
    message: string,
    readonly kind: "refused" | "conflict" | "offline" | "shape" = "refused"
  ) {
    super(message);
    this.name = "VaultClientError";
  }
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

function reasonOf(reply: VaultReply, fallback: string): string {
  const reason = asObject(reply.body).reason;
  return typeof reason === "string" && reason.trim() !== "" ? reason : fallback;
}

function sessionOf(reply: VaultReply): VaultSession {
  const body = asObject(reply.body);
  const { token, userId, deviceId } = body;
  if (typeof token !== "string" || typeof userId !== "string" || typeof deviceId !== "string") {
    throw new VaultClientError("The server answered something this app does not understand.", "shape");
  }
  return { token, userId, deviceId };
}

/** Over the network: the four calls the site makes, and nothing else. */
export function createVaultClient(transport: VaultTransport) {
  return {
    async register(email: string, password: string, deviceName: string): Promise<VaultSession> {
      const reply = await transport("POST", "/api/vault/register", { body: { email, password, deviceName } });
      if (reply.status !== 201) throw new VaultClientError(reasonOf(reply, "The account could not be created."));
      return sessionOf(reply);
    },

    async login(email: string, password: string, deviceName: string): Promise<VaultSession> {
      const reply = await transport("POST", "/api/vault/login", { body: { email, password, deviceName } });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "Wrong email or password."));
      return sessionOf(reply);
    },

    /** The stored ciphertext, or null for an account that has never saved one. */
    async fetchVault(token: string): Promise<{ vaultVersion: number; text: string } | null> {
      const reply = await transport("GET", "/api/vault", { token });
      if (reply.status === 204) return null;
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "The vault could not be read."));
      const body = asObject(reply.body);
      if (typeof body.text !== "string" || typeof body.vaultVersion !== "number") {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return { vaultVersion: body.vaultVersion, text: body.text };
    },

    /**
     * Stores a version on top of the one this device had.
     *
     * A 409 means another device saved first. It is reported as a conflict
     * rather than forced through: overwriting would throw away whatever that
     * other device recorded, and money recorded on a phone is not disposable.
     */
    async putVault(token: string, payload: { vaultVersion: number; expectedVersion: number; text: string }): Promise<number> {
      const reply = await transport("PUT", "/api/vault", { token, body: payload });
      if (reply.status === 409) {
        throw new VaultClientError(
          "This vault was changed on another device while you were working. Reload before saving again.",
          "conflict"
        );
      }
      if (reply.status !== 201) throw new VaultClientError(reasonOf(reply, "The vault could not be saved."));
      const version = asObject(reply.body).vaultVersion;
      if (typeof version !== "number") {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return version;
    },
  };
}

export interface OpenVault {
  document: VaultDocument;
  /** The version this device holds; the next save is this plus one. */
  version: number;
}

/**
 * Turns stored ciphertext into the document on screen.
 *
 * `minVersion` is what this device has already accepted: a server that answers
 * with something older is rolling the vault back, which the cipher refuses.
 */
export function openDocument(input: {
  text: string;
  seed: string;
  userId: string;
  minVersion?: number;
}): OpenVault {
  const entropy = seedEntropy(input.seed);
  try {
    const { plaintext, vaultVersion } = decryptVault({
      text: input.text,
      entropy,
      userId: input.userId,
      minVaultVersion: input.minVersion ?? 0,
    });
    try {
      return { document: readDocument(JSON.parse(new TextDecoder().decode(plaintext))), version: vaultVersion };
    } finally {
      plaintext.fill(0);
    }
  } finally {
    entropy.fill(0);
  }
}

/** The document as ciphertext for the next version. */
export async function sealDocument(input: {
  document: VaultDocument;
  seed: string;
  userId: string;
  /** The version this device holds; what is written is the one after it. */
  version: number;
  random: (length: number) => Uint8Array | Promise<Uint8Array>;
}): Promise<{ text: string; vaultVersion: number; expectedVersion: number }> {
  const entropy = seedEntropy(input.seed);
  const plaintext = new TextEncoder().encode(JSON.stringify(input.document));
  try {
    const text = await encryptVault({
      plaintext,
      entropy,
      userId: input.userId,
      vaultVersion: input.version + 1,
      random: input.random,
    });
    return { text, vaultVersion: input.version + 1, expectedVersion: input.version };
  } finally {
    plaintext.fill(0);
    entropy.fill(0);
  }
}

/** The browser's random source, as the cipher wants it. */
export function browserRandom(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** A transport over `fetch`, for the page. Never sends cookies: the token is the credential. */
export function fetchTransport(origin = ""): VaultTransport {
  return async (method, path, init) => {
    let response: Response;
    try {
      response = await fetch(`${origin}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      throw new VaultClientError("The server could not be reached. Nothing was sent.", "offline");
    }
    if (response.status === 204) return { status: 204, body: null };
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text === "" ? null : JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
}
