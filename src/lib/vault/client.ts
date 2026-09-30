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
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  init: { token?: string; body?: unknown }
) => Promise<VaultReply>;

export interface VaultSession {
  token: string;
  userId: string;
  deviceId: string;
  /**
   * Whose vault this is, when known. Shown on screen so a device let in by a
   * code says which account it opened — a phone scanning someone else's code
   * would otherwise leave a computer in the wrong vault without a word.
   */
  email?: string;
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

/**
 * Why the server refused, in its own words.
 *
 * The server's refusals carry them under `error` (see `refused` in
 * app/api/vault/respond.ts); this read only `reason`, which nothing sends, so
 * every refusal fell back to the generic line — a password too short read
 * "The account could not be created." and never said what to change.
 */
function reasonOf(reply: VaultReply, fallback: string): string {
  const body = asObject(reply.body);
  for (const said of [body.error, body.reason]) {
    if (typeof said === "string" && said.trim() !== "") return said;
  }
  return fallback;
}

function sessionOf(reply: VaultReply): VaultSession {
  const body = asObject(reply.body);
  const { token, userId, deviceId, email } = body;
  if (typeof token !== "string" || typeof userId !== "string" || typeof deviceId !== "string") {
    throw new VaultClientError("The server answered something this app does not understand.", "shape");
  }
  return typeof email === "string" ? { token, userId, deviceId, email } : { token, userId, deviceId };
}

/** Over the network: every call the site makes, and nothing else. */
export function createVaultClient(transport: VaultTransport) {
  return {
    async register(email: string, password: string, deviceName: string): Promise<VaultSession> {
      const reply = await transport("POST", "/api/vault/register", { body: { email, password, deviceName } });
      if (reply.status !== 201) throw new VaultClientError(reasonOf(reply, "The account could not be created."));
      return { ...sessionOf(reply), email: email.trim().toLowerCase() };
    },

    async login(email: string, password: string, deviceName: string): Promise<VaultSession> {
      const reply = await transport("POST", "/api/vault/login", { body: { email, password, deviceName } });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "Wrong email or password."));
      return { ...sessionOf(reply), email: email.trim().toLowerCase() };
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

    /** Every device signed into the account, including revoked ones, newest first. */
    async listDevices(token: string): Promise<VaultDevice[]> {
      const reply = await transport("GET", "/api/vault/devices", { token });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "The devices could not be listed."));
      const devices = asObject(reply.body).devices;
      if (!Array.isArray(devices)) {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return devices.map((d) => {
        const row = asObject(d);
        return {
          id: String(row.id),
          name: String(row.name),
          createdAt: String(row.createdAt),
          lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : null,
          revokedAt: typeof row.revokedAt === "string" ? row.revokedAt : null,
          current: row.current === true,
        };
      });
    },

    async revokeDevice(token: string, deviceId: string): Promise<void> {
      const reply = await transport("DELETE", `/api/vault/devices/${encodeURIComponent(deviceId)}`, { token });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "That device could not be signed out."));
    },

    // Opening the vault on a phone from a code: see lib/vault/link.ts.

    async createLink(token: string, sealed: string): Promise<{ id: string; expiresAt: string }> {
      const reply = await transport("POST", "/api/vault/links", { token, body: { sealed } });
      if (reply.status !== 201) throw new VaultClientError(reasonOf(reply, "No code could be made."));
      const { id, expiresAt } = asObject(reply.body);
      if (typeof id !== "string" || typeof expiresAt !== "string") {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return { id, expiresAt };
    },

    async linkStatus(token: string, id: string): Promise<{ state: string; deviceName: string | null }> {
      const reply = await transport("GET", `/api/vault/links/${encodeURIComponent(id)}`, { token });
      if (reply.status === 404) return { state: "gone", deviceName: null };
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "The code could not be checked."));
      const { state, deviceName } = asObject(reply.body);
      return { state: String(state), deviceName: typeof deviceName === "string" ? deviceName : null };
    },

    async answerLink(token: string, id: string, allow: boolean): Promise<void> {
      const reply = await transport("POST", `/api/vault/links/${encodeURIComponent(id)}/answer`, {
        token,
        body: { allow },
      });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "The answer did not reach the server."));
    },

    async askLink(id: string, deviceName: string, claimHash: string): Promise<void> {
      const reply = await transport("POST", `/api/vault/links/${encodeURIComponent(id)}/ask`, {
        body: { deviceName, claimHash },
      });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "This code no longer works."));
    },

    /** Null while the owner has not answered; the session and the sealed words once they said yes. */
    async collectLink(id: string, claimKey: string): Promise<(VaultSession & { sealed: string }) | null> {
      const reply = await transport("POST", `/api/vault/links/${encodeURIComponent(id)}/collect`, {
        body: { claimKey },
      });
      if (reply.status === 202) return null;
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "This code no longer works."));
      const sealed = asObject(reply.body).sealed;
      if (typeof sealed !== "string") {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return { ...sessionOf(reply), sealed };
    },

    // The other direction: this device has no session, and a phone lets it in.

    async createSignInRequest(deviceName: string, claimHash: string): Promise<{ id: string; expiresAt: string }> {
      const reply = await transport("POST", "/api/vault/sign-in-requests", { body: { deviceName, claimHash } });
      if (reply.status !== 201) throw new VaultClientError(reasonOf(reply, "No code could be made."));
      const { id, expiresAt } = asObject(reply.body);
      if (typeof id !== "string" || typeof expiresAt !== "string") {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return { id, expiresAt };
    },

    /** The name of the device asking, for the phone to show before it says yes. */
    async signInRequest(token: string, id: string): Promise<{ deviceName: string }> {
      const reply = await transport("GET", `/api/vault/sign-in-requests/${encodeURIComponent(id)}`, { token });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "This code no longer works."));
      const deviceName = asObject(reply.body).deviceName;
      return { deviceName: typeof deviceName === "string" ? deviceName : "A device" };
    },

    async grantSignIn(token: string, id: string, sealed: string): Promise<void> {
      const reply = await transport("POST", `/api/vault/sign-in-requests/${encodeURIComponent(id)}/grant`, {
        token,
        body: { sealed },
      });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "This code no longer works."));
    },

    async refuseSignIn(token: string, id: string): Promise<void> {
      const reply = await transport("DELETE", `/api/vault/sign-in-requests/${encodeURIComponent(id)}`, { token });
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "The answer did not reach the server."));
    },

    /** Null while no phone has answered; the session and the sealed words once one said yes. */
    async collectSignIn(id: string, claimKey: string): Promise<(VaultSession & { sealed: string }) | null> {
      const reply = await transport("POST", `/api/vault/sign-in-requests/${encodeURIComponent(id)}/collect`, {
        body: { claimKey },
      });
      if (reply.status === 202) return null;
      if (reply.status !== 200) throw new VaultClientError(reasonOf(reply, "This code no longer works."));
      const sealed = asObject(reply.body).sealed;
      if (typeof sealed !== "string") {
        throw new VaultClientError("The server answered something this app does not understand.", "shape");
      }
      return { ...sessionOf(reply), sealed };
    },
  };
}

export interface VaultDevice {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  current: boolean;
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
