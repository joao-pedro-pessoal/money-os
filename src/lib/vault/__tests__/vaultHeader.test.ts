import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { VaultError, decryptVault, encryptVault, readVaultHeader } from "../cipher";

const random = (n: number) => new Uint8Array(randomBytes(n));

describe("reading a vault's header without the seed", () => {
  it("returns the account and version a vault claims", async () => {
    const text = await encryptVault({
      plaintext: new TextEncoder().encode("{}"), entropy: random(16), userId: "user_a", vaultVersion: 7, random,
    });
    expect(readVaultHeader(text)).toEqual({ userId: "user_a", vaultVersion: 7 });
  });

  it("applies the same envelope rules the device applies before decrypting", async () => {
    // One reader for both ends: whatever the server would store, a device can at
    // least parse; whatever a device refuses as malformed, the server refuses too.
    const entropy = random(16);
    const text = await encryptVault({
      plaintext: new TextEncoder().encode("{}"), entropy, userId: "user_a", vaultVersion: 1,
      random: (n) => new Uint8Array(n).fill(0xab),
    });
    const upper = JSON.stringify({ ...JSON.parse(text), nonce: JSON.parse(text).nonce.toUpperCase() });

    expect(() => readVaultHeader(upper)).toThrow(VaultError);
    expect(() => decryptVault({ text: upper, entropy, userId: "user_a", minVaultVersion: 0 })).toThrow(VaultError);
    expect(() => readVaultHeader("{}")).toThrow(VaultError);
    expect(() => readVaultHeader("x".repeat(50_000_000))).toThrow(VaultError);
  });
});
