import { describe, expect, it } from "vitest";
import {
  CredentialError,
  KEY_HEX,
  newRecoveryCode,
  normaliseRecoveryCode,
  recoveryHashOf,
  sameKey,
  signInKeyFor,
} from "../credentials";

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

describe("the sign-in key the page sends instead of the password", () => {
  it("is the same for the same email and password, whatever the email's case", async () => {
    const one = await signInKeyFor("Ana@Mail.pt ", "a long enough password");
    expect(one).toMatch(KEY_HEX);
    expect(await signInKeyFor("ana@mail.pt", "a long enough password")).toBe(one);
  }, 20_000);

  it("differs for another password, and for the same password on another email", async () => {
    const base = await signInKeyFor("ana@mail.pt", "a long enough password");
    expect(await signInKeyFor("ana@mail.pt", "a long enough passwore")).not.toBe(base);
    expect(await signInKeyFor("rui@mail.pt", "a long enough password")).not.toBe(base);
  }, 30_000);

  it("reads a password the same however a keyboard composed its accents", async () => {
    expect(await signInKeyFor("ana@mail.pt", "palavra-passe é longa")).toBe(
      await signInKeyFor("ana@mail.pt", "palavra-passe é longa")
    );
  }, 20_000);

  /**
   * Pinned: every stored hash is of a key made this way. A change to the
   * labels, the salt or the scrypt cost would lock every account out.
   */
  it("has not changed how it is made", async () => {
    expect(await signInKeyFor("pin@example.com", "correct horse battery staple")).toBe(
      "a92de71777f87959fa4b6474cbeb5f9d888463c8c7165946a722fc2b8fbe8594"
    );
  }, 20_000);

  it("compares only well-formed keys", () => {
    expect(sameKey("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(sameKey("a".repeat(64), "b".repeat(64))).toBe(false);
    expect(sameKey("ab", "ab")).toBe(false);
  });
});

describe("the recovery code", () => {
  it("is four groups of five letters that cannot be confused, different every time", () => {
    const code = newRecoveryCode(random);
    expect(code).toMatch(/^[a-hj-kmnp-z2-9]{5}(-[a-hj-kmnp-z2-9]{5}){3}$/);
    expect(newRecoveryCode(random)).not.toBe(code);
  });

  it("is checked however it is typed back", () => {
    const code = newRecoveryCode(random);
    const stored = recoveryHashOf(code);
    expect(stored).toMatch(KEY_HEX);
    expect(recoveryHashOf(` ${code.toUpperCase().replace(/-/g, " ")} `)).toBe(stored);
    expect(normaliseRecoveryCode("AB-cd ef")).toBe("abcdef");
  });

  it("refuses what cannot be one", () => {
    expect(() => recoveryHashOf("too short")).toThrow(CredentialError);
    expect(() => recoveryHashOf("iiiii-lllll-ooooo-00000")).toThrow(CredentialError);
  });
});
