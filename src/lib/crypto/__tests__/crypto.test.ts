import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, maskSecret, deriveKey, safeEqual } from "../index";

const KEY = "a-long-enough-master-key-for-tests";
const SECRET = "bybit-api-secret-abcdef123456";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    expect(decryptSecret(encryptSecret(SECRET, KEY), KEY)).toBe(SECRET);
  });

  it("never stores the plaintext in the output", () => {
    const encrypted = encryptSecret(SECRET, KEY);
    expect(encrypted).not.toContain(SECRET);
    expect(encrypted).not.toContain("abcdef123456");
  });

  it("produces different ciphertext each time, so repeats aren't recognisable", () => {
    expect(encryptSecret(SECRET, KEY)).not.toBe(encryptSecret(SECRET, KEY));
  });

  it("refuses to decrypt with the wrong key", () => {
    const encrypted = encryptSecret(SECRET, KEY);
    expect(() => decryptSecret(encrypted, "a-different-master-key-entirely")).toThrow(/wrong encryption key/);
  });

  it("detects tampering rather than returning wrong bytes", () => {
    const encrypted = encryptSecret(SECRET, KEY);
    const [iv, tag, data] = encrypted.split(":");
    // Flip a character in the ciphertext.
    const altered = data[0] === "A" ? "B" + data.slice(1) : "A" + data.slice(1);
    expect(() => decryptSecret([iv, tag, altered].join(":"), KEY)).toThrow();
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptSecret("nonsense", KEY)).toThrow(/malformed/);
    expect(() => decryptSecret("a:b", KEY)).toThrow(/malformed/);
  });

  it("handles empty and unicode secrets", () => {
    expect(decryptSecret(encryptSecret("", KEY), KEY)).toBe("");
    const unicode = "segredo-çãé-🔑";
    expect(decryptSecret(encryptSecret(unicode, KEY), KEY)).toBe(unicode);
  });
});

describe("deriveKey", () => {
  it("always produces 32 bytes", () => {
    expect(deriveKey(KEY)).toHaveLength(32);
    expect(deriveKey("x".repeat(200))).toHaveLength(32);
  });

  it("refuses a key too short to be worth anything", () => {
    expect(() => deriveKey("short")).toThrow(/at least 16/);
    expect(() => deriveKey("")).toThrow();
  });
});

describe("maskSecret", () => {
  it("shows only the last four characters", () => {
    expect(maskSecret("abcdef123456")).toBe("••••3456");
  });

  it("hides a short value entirely", () => {
    expect(maskSecret("abc")).toBe("••••");
  });

  it("handles an empty value", () => {
    expect(maskSecret("")).toBe("");
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("rejects different strings and different lengths", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
