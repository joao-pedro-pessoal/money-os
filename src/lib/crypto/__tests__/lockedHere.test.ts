import { describe, it, expect } from "vitest";
import { deriveKey, encryptSecret, holdsMasterKey, secretLockedHere } from "../index";

const KEY = "a-long-enough-master-key-for-tests";
const keyed = { encryptedSecret: encryptSecret("api-secret", KEY), encryptedPassphrase: null };

describe("holdsMasterKey", () => {
  it("accepts exactly what deriveKey accepts", () => {
    for (const value of [undefined, "", "short", "fifteen-chars..", "sixteen-chars..."]) {
      const derivable = (() => {
        try {
          deriveKey(value as string);
          return true;
        } catch {
          return false;
        }
      })();
      expect(holdsMasterKey(value)).toBe(derivable);
    }
  });
});

describe("secretLockedHere", () => {
  it("locks a connection with a secret on a copy without the key", () => {
    expect(secretLockedHere(keyed, undefined)).toBe(true);
    expect(secretLockedHere(keyed, "")).toBe(true);
    expect(secretLockedHere(keyed, "too-short")).toBe(true);
  });

  it("opens it where the key is", () => {
    expect(secretLockedHere(keyed, KEY)).toBe(false);
  });

  it("counts a passphrase alone as something only the key opens", () => {
    const passphraseOnly = { encryptedSecret: null, encryptedPassphrase: encryptSecret("okx-pass", KEY) };
    expect(secretLockedHere(passphraseOnly, undefined)).toBe(true);
  });

  it("never locks a connection that stores nothing secret, so Hyperliquid syncs anywhere", () => {
    const publicRead = { encryptedSecret: null, encryptedPassphrase: null };
    expect(secretLockedHere(publicRead, undefined)).toBe(false);
    expect(secretLockedHere(publicRead, KEY)).toBe(false);
  });
});
