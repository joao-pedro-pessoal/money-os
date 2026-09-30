import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { hashPassword, needsRehash, passwordProblem, verifyPassword, PASSWORD_MAX } from "../password";

const random = (n: number) => new Uint8Array(randomBytes(n));
const password = "uma frase suficientemente longa";
let stored = "";

// Real parameters, so the tests measure what production runs; hashed once and shared.
beforeAll(async () => {
  stored = await hashPassword(password, random);
}, 30_000);

describe("sync account passwords", () => {
  it("verifies the password it hashed, and not a near miss", async () => {
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword(`${password}!`, stored)).toBe(false);
  });

  it("stores its parameters and salt, never the password", () => {
    expect(stored).toMatch(/^scrypt\$15\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(stored).not.toContain(password);
    expect(needsRehash(stored)).toBe(false);
  });

  it("gives the same password a different hash each time", async () => {
    expect(await hashPassword(password, random)).not.toBe(stored);
  }, 30_000);

  it("accepts an accented password however the keyboard composed it", async () => {
    const composed = "palavra-passe café ação".normalize("NFC");
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);

    const hashed = await hashPassword(composed, random);
    expect(await verifyPassword(decomposed, hashed)).toBe(true);
  }, 30_000);

  it("refuses a password below the minimum before hashing", async () => {
    expect(passwordProblem("curta")).toMatch(/at least 12/);
    await expect(hashPassword("curta", random)).rejects.toThrow(/at least 12/);
  });

  it("answers no to an over-long password without doing the work", async () => {
    expect(await verifyPassword("x".repeat(PASSWORD_MAX + 1), stored)).toBe(false);
  });

  it("rejects a tampered hash", async () => {
    const last = stored.at(-1) === "0" ? "1" : "0";
    expect(await verifyPassword(password, stored.slice(0, -1) + last)).toBe(false);
  });

  it("refuses parameters that would make one login consume the server", async () => {
    const huge = `scrypt$30$8$3$${"00".repeat(16)}$${"00".repeat(32)}`;
    await expect(verifyPassword(password, huge)).rejects.toThrow(/out of range/);
    await expect(verifyPassword(password, `bcrypt$10$x`)).rejects.toThrow(/Unrecognised/);
  });

  it("flags a hash made with weaker parameters for upgrade", () => {
    expect(needsRehash(`scrypt$14$8$1$${"00".repeat(16)}$${"00".repeat(32)}`)).toBe(true);
  });
});
