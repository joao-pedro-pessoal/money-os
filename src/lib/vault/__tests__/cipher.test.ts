import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { VaultError, decryptVault, deriveVaultKey, encryptVault } from "../cipher";
import { generateSeed, seedEntropy } from "../seed";

const random = (n: number) => new Uint8Array(randomBytes(n));
const entropy = () => random(16);
const secret = "Private note";
const plaintext = utf8ToBytes(JSON.stringify({ note: secret, balance: "1234.56" }));

/** The reason a decryption was refused, so a test states which failure it expects. */
function failure(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof VaultError) return e.reason;
    throw e;
  }
  throw new Error("expected the vault to be refused");
}

/** Flips one bit of the ciphertext, keeping the hex canonical. */
function tamper(text: string): string {
  const env = JSON.parse(text);
  const first = (parseInt(env.ciphertext.slice(0, 2), 16) ^ 1).toString(16).padStart(2, "0");
  env.ciphertext = first + env.ciphertext.slice(2);
  return JSON.stringify(env);
}

function edit(text: string, over: Record<string, unknown>): string {
  return JSON.stringify({ ...JSON.parse(text), ...over });
}

describe("sync vault encryption", () => {
  it("round-trips through a seed, and the stored text reveals nothing", async () => {
    const e = seedEntropy(await generateSeed(random));
    const text = await encryptVault({ plaintext, entropy: e, userId: "user_a", vaultVersion: 1, random });

    expect(text).not.toContain(secret);
    expect(text).not.toContain(bytesToHex(utf8ToBytes(secret)));
    const opened = decryptVault({ text, entropy: e, userId: "user_a", minVaultVersion: 0 });
    expect(opened.plaintext).toEqual(plaintext);
    expect(opened.vaultVersion).toBe(1);
  });

  it("uses a fresh nonce each time, so the same vault never encrypts the same way twice", async () => {
    const e = entropy();
    const input = { plaintext, entropy: e, userId: "user_a", vaultVersion: 1, random };
    const [a, b] = [await encryptVault(input), await encryptVault(input)];
    expect(JSON.parse(a).nonce).not.toBe(JSON.parse(b).nonce);
    expect(JSON.parse(a).ciphertext).not.toBe(JSON.parse(b).ciphertext);
  });

  it("refuses a different seed without saying which of key or data was wrong", async () => {
    const text = await encryptVault({ plaintext, entropy: entropy(), userId: "u", vaultVersion: 1, random });
    expect(failure(() => decryptVault({ text, entropy: entropy(), userId: "u", minVaultVersion: 0 }))).toBe(
      "key-or-damage"
    );
  });

  it("refuses a single altered bit", async () => {
    const e = entropy();
    const text = await encryptVault({ plaintext, entropy: e, userId: "u", vaultVersion: 1, random });
    expect(failure(() => decryptVault({ text: tamper(text), entropy: e, userId: "u", minVaultVersion: 0 }))).toBe(
      "key-or-damage"
    );
  });

  describe("against a server that is not trusted", () => {
    it("refuses a vault labelled as someone else's", async () => {
      const e = entropy();
      const text = await encryptVault({ plaintext, entropy: e, userId: "alice", vaultVersion: 1, random });
      expect(failure(() => decryptVault({ text, entropy: e, userId: "bob", minVaultVersion: 0 }))).toBe(
        "other-account"
      );
    });

    it("catches a server that relabels the owner to get past that check", async () => {
      // The envelope now claims Bob, so the early check passes; the owner is also
      // inside the tag, so decryption does not.
      const e = entropy();
      const text = await encryptVault({ plaintext, entropy: e, userId: "alice", vaultVersion: 1, random });
      const relabelled = edit(text, { userId: "bob" });
      expect(failure(() => decryptVault({ text: relabelled, entropy: e, userId: "bob", minVaultVersion: 0 }))).toBe(
        "key-or-damage"
      );
    });

    it("refuses a genuine older version served as the current one", async () => {
      const e = entropy();
      const old = await encryptVault({ plaintext, entropy: e, userId: "u", vaultVersion: 3, random });
      expect(failure(() => decryptVault({ text: old, entropy: e, userId: "u", minVaultVersion: 5 }))).toBe("rollback");
    });

    it("catches a server that renumbers an old version to look new", async () => {
      const e = entropy();
      const old = await encryptVault({ plaintext, entropy: e, userId: "u", vaultVersion: 3, random });
      const renumbered = edit(old, { vaultVersion: 9 });
      expect(failure(() => decryptVault({ text: renumbered, entropy: e, userId: "u", minVaultVersion: 5 }))).toBe(
        "key-or-damage"
      );
    });

    it("accepts the version the device already has", async () => {
      const e = entropy();
      const text = await encryptVault({ plaintext, entropy: e, userId: "u", vaultVersion: 5, random });
      expect(decryptVault({ text, entropy: e, userId: "u", minVaultVersion: 5 }).vaultVersion).toBe(5);
    });
  });

  describe("the envelope", () => {
    it("refuses a second spelling of the same bytes", async () => {
      // A nonce of 0xab bytes spells "abab…", so its uppercase form is a genuinely
      // different string for the same bytes. A random nonce would leave that to
      // chance, and a test that sometimes asserts nothing proves nothing.
      const e = entropy();
      const lettered = (n: number) => new Uint8Array(n).fill(0xab);
      const text = await encryptVault({ plaintext, entropy: e, userId: "u", vaultVersion: 1, random: lettered });
      const upper = edit(text, { nonce: JSON.parse(text).nonce.toUpperCase() });

      expect(upper).not.toBe(text);
      expect(failure(() => decryptVault({ text: upper, entropy: e, userId: "u", minVaultVersion: 0 }))).toBe(
        "format"
      );
      // The canonical spelling still opens, so the refusal is about the spelling alone.
      expect(decryptVault({ text, entropy: e, userId: "u", minVaultVersion: 0 }).plaintext).toEqual(plaintext);
    });

    it("refuses unknown fields, other formats and oversized text before deriving a key", async () => {
      const e = entropy();
      const text = await encryptVault({ plaintext, entropy: e, userId: "u", vaultVersion: 1, random });
      const open = (t: string) => () => decryptVault({ text: t, entropy: e, userId: "u", minVaultVersion: 0 });

      expect(failure(open(edit(text, { extra: true })))).toBe("format");
      expect(failure(open(edit(text, { format: "money-os-local-backup" })))).toBe("format");
      expect(failure(open(edit(text, { formatVersion: 2 })))).toBe("format");
      expect(failure(open("not json"))).toBe("format");
      expect(failure(open("x".repeat(50_000_000)))).toBe("format");
    });
  });

  describe("inputs a caller can get wrong", () => {
    it("refuses an account id that could collide inside the authenticated data", async () => {
      await expect(
        encryptVault({ plaintext, entropy: entropy(), userId: "a|1", vaultVersion: 2, random })
      ).rejects.toThrow(/letters, digits/);
    });

    it("refuses a version below 1 and a short nonce", async () => {
      await expect(
        encryptVault({ plaintext, entropy: entropy(), userId: "u", vaultVersion: 0, random })
      ).rejects.toThrow(/from 1 upwards/);
      await expect(
        encryptVault({ plaintext, entropy: entropy(), userId: "u", vaultVersion: 1, random: () => new Uint8Array(8) })
      ).rejects.toThrow(/12-byte nonce/);
    });

    it("derives the same key for the same seed and a different one otherwise", () => {
      const e = entropy();
      expect(deriveVaultKey(e)).toEqual(deriveVaultKey(new Uint8Array(e)));
      expect(deriveVaultKey(e)).not.toEqual(deriveVaultKey(entropy()));
      expect(deriveVaultKey(e)).toHaveLength(32);
      expect(() => deriveVaultKey(new Uint8Array(32))).toThrow(/16 bytes/);
    });
  });
});
