import { describe, expect, it } from "vitest";
import {
  CredentialError,
  KEY_HEX,
  passwordKeys,
  recoveryHashOf,
  recoveryKeyOf,
  sameKey,
  sealWords,
  SEALED_WORDS,
  unsealWords,
} from "../credentials";
import { deriveVaultKey } from "../cipher";
import { generateSeed, seedEntropy } from "../seed";
import { bytesToHex } from "@noble/hashes/utils.js";

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

describe("signing in with a password alone", () => {
  it("gives the same keys for the same email and password, whatever the email's case", async () => {
    const one = await passwordKeys("Ana@Mail.pt ", "a long enough password");
    const two = await passwordKeys("ana@mail.pt", "a long enough password");
    expect(one.signInKey).toMatch(KEY_HEX);
    expect(one.signInKey).toBe(two.signInKey);
    expect(bytesToHex(one.sealKey)).toBe(bytesToHex(two.sealKey));
  }, 20_000);

  /** The server checks the sign-in key; if it were the seal key, the server could open the words. */
  it("sends the server a key that is not the one that opens the words", async () => {
    const { signInKey, sealKey } = await passwordKeys("ana@mail.pt", "a long enough password");
    expect(signInKey).not.toBe(bytesToHex(sealKey));
  }, 20_000);

  it("gives different keys to a different password, and to the same password on another email", async () => {
    const base = await passwordKeys("ana@mail.pt", "a long enough password");
    const otherPassword = await passwordKeys("ana@mail.pt", "a long enough passwore");
    const otherEmail = await passwordKeys("rui@mail.pt", "a long enough password");
    expect(otherPassword.signInKey).not.toBe(base.signInKey);
    expect(otherEmail.signInKey).not.toBe(base.signInKey);
  }, 30_000);

  it("reads a password the same however a keyboard composed its accents", async () => {
    const composed = await passwordKeys("ana@mail.pt", "palavra-passe é longa");
    const decomposed = await passwordKeys("ana@mail.pt", "palavra-passe é longa");
    expect(composed.signInKey).toBe(decomposed.signInKey);
  }, 20_000);
});

describe("the twelve words kept sealed on the server", () => {
  it("come back under the same password and not under another", async () => {
    const words = await generateSeed(random);
    const right = await passwordKeys("ana@mail.pt", "a long enough password");
    const wrong = await passwordKeys("ana@mail.pt", "not the password at all");
    const sealed = sealWords(words, right.sealKey, random);

    expect(sealed).toMatch(SEALED_WORDS);
    expect(sealed).not.toContain(words.split(" ")[0]);
    expect(unsealWords(sealed, right.sealKey)).toBe(words);
    expect(() => unsealWords(sealed, wrong.sealKey)).toThrow(CredentialError);
  }, 30_000);

  it("are refused when they are not a seed, and when what is stored was altered", async () => {
    const { sealKey } = await passwordKeys("ana@mail.pt", "a long enough password");
    expect(() => sealWords("not twelve words", sealKey, random)).toThrow(CredentialError);

    const sealed = sealWords(await generateSeed(random), sealKey, random);
    const flipped = sealed.slice(0, -1) + (sealed.endsWith("0") ? "1" : "0");
    expect(() => unsealWords(flipped, sealKey)).toThrow(CredentialError);
    expect(() => unsealWords("seal1.zz.zz", sealKey)).toThrow(CredentialError);
  }, 20_000);
});

describe("recovering with the twelve words", () => {
  it("proves the words with a key the server can check but that opens nothing", async () => {
    const words = await generateSeed(random);
    const key = recoveryKeyOf(words);
    expect(key).toMatch(KEY_HEX);
    // Retyped with capitals and extra spaces, the same words give the same key.
    expect(recoveryKeyOf(`  ${words.toUpperCase().replace(/ /g, "   ")} `)).toBe(key);
    // Not the vault's key: the server learns this one at recovery.
    const entropy = seedEntropy(words);
    expect(key).not.toBe(bytesToHex(deriveVaultKey(entropy)));

    const stored = recoveryHashOf(key);
    expect(stored).not.toBe(key);
    expect(sameKey(recoveryHashOf(recoveryKeyOf(words)), stored)).toBe(true);
    expect(sameKey(recoveryHashOf(recoveryKeyOf(await generateSeed(random))), stored)).toBe(false);
  });

  it("compares only well-formed keys", () => {
    expect(sameKey("ab", "ab")).toBe(false);
    expect(() => recoveryHashOf("not hex")).toThrow(CredentialError);
  });
});
