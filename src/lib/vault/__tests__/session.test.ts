import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { bearerToken, hashSessionToken, newSessionToken, sessionExpiry, SESSION_DAYS } from "../session";

const random = (n: number) => new Uint8Array(randomBytes(n));

describe("device session tokens", () => {
  it("issues a 256-bit token and stores only its hash", async () => {
    const { token, tokenHash } = await newSessionToken(random);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
    expect(hashSessionToken(token)).toBe(tokenHash);
  });

  it("clears the random bytes once the token exists", async () => {
    const handed: { bytes?: Uint8Array } = {};
    await newSessionToken((n) => (handed.bytes = random(n)));
    expect(handed.bytes!.every((b) => b === 0)).toBe(true);
  });

  it("refuses to hash anything that is not a token", () => {
    expect(() => hashSessionToken("not-a-token")).toThrow(/Malformed/);
    expect(() => hashSessionToken("A".repeat(64))).toThrow(/Malformed/);
  });

  it("reads exactly one well-formed bearer token, or nothing", async () => {
    const { token } = await newSessionToken(random);
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer ${token}`)).toBe(token);
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken(`Bearer ${token.slice(1)}`)).toBeNull();
    expect(bearerToken(`Basic ${token}`)).toBeNull();
    expect(bearerToken(`Bearer ${token} ${token}`)).toBeNull();
  });

  it("expires a session after its lifetime", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    const days = (sessionExpiry(now).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(SESSION_DAYS);
  });
});
