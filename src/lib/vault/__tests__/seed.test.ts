import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import {
  SEED_WORDS,
  generateSeed,
  isValidSeed,
  normaliseSeed,
  seedEntropy,
  seedFromEntropy,
} from "../seed";

/**
 * Two standard BIP39 vectors, all-zero and all-ones entropy. Confirmed by running
 * @scure/bip39 in this checkout before being written here, not copied from memory:
 * a wrong vector in a crypto test is a test that passes while asserting something
 * false.
 */
const ZERO_SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ONES_SEED = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";

describe("recovery seed", () => {
  it("matches the standard vectors, so a seed written here opens anywhere else", () => {
    expect(seedFromEntropy(new Uint8Array(16))).toBe(ZERO_SEED);
    expect(seedFromEntropy(new Uint8Array(16).fill(0xff))).toBe(ONES_SEED);
  });

  it("round-trips entropy through the words", () => {
    for (let i = 0; i < 50; i++) {
      const entropy = new Uint8Array(randomBytes(16));
      expect(seedEntropy(seedFromEntropy(entropy))).toEqual(entropy);
    }
  });

  it("issues twelve valid words from injected randomness, and clears it", async () => {
    const handed: { bytes?: Uint8Array } = {};
    const seed = await generateSeed((n) => (handed.bytes = new Uint8Array(randomBytes(n))));

    expect(seed.split(" ")).toHaveLength(SEED_WORDS);
    expect(isValidSeed(seed)).toBe(true);
    expect(handed.bytes!.every((b) => b === 0)).toBe(true);
  });

  it("refuses any entropy length but sixteen bytes", () => {
    expect(() => seedFromEntropy(new Uint8Array(32))).toThrow(/16 bytes/);
  });

  it("accepts the words however they were retyped", () => {
    const messy =
      "  Abandon abandon\nABANDON abandon abandon abandon   abandon abandon abandon abandon abandon About ";
    expect(normaliseSeed(messy)).toBe(ZERO_SEED);
    expect(isValidSeed(messy)).toBe(true);
    expect(seedEntropy(messy)).toEqual(new Uint8Array(16));
  });

  it("says how many words there are rather than calling the seed wrong", () => {
    expect(() => seedEntropy("abandon abandon abandon")).toThrow(/12 words; this has 3/);
    expect(() => seedEntropy("   ")).toThrow(/this has 0/);
    expect(isValidSeed("")).toBe(false);
  });

  it("names a word that is not in the list", () => {
    expect(() => seedEntropy(ZERO_SEED.replace(/about$/, "abuot"))).toThrow(/"abuot"/);
  });

  it("catches a valid word in the wrong place through the checksum", () => {
    // Every word is real; only the checksum can tell this is not the seed issued.
    const swapped = ZERO_SEED.replace(/about$/, "abandon");
    expect(isValidSeed(swapped)).toBe(false);
    expect(() => seedEntropy(swapped)).toThrow(/checksum/);
  });
});
