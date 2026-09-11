import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptVault } from "../cipher";
import {
  LOCKOUT_MINUTES,
  LoginRequest,
  MAX_FAILED_LOGINS,
  RegisterRequest,
  afterFailedLogin,
  checkVaultPut,
  lockedUntil,
} from "../protocol";

const random = (n: number) => new Uint8Array(randomBytes(n));

async function vault(userId: string, vaultVersion: number): Promise<string> {
  return encryptVault({
    plaintext: new TextEncoder().encode("{}"), entropy: random(16), userId, vaultVersion, random,
  });
}

describe("requests the sync server accepts", () => {
  it("normalises an address, so one person does not become two accounts", () => {
    const parsed = RegisterRequest.parse({
      email: "  Joao@Example.COM ", password: "uma frase suficientemente longa", deviceName: " Pixel ",
    });
    expect(parsed.email).toBe("joao@example.com");
    expect(parsed.deviceName).toBe("Pixel");
  });

  it("refuses a malformed address, a short password and unknown fields at registration", () => {
    const ok = { email: "a@b.pt", password: "uma frase suficientemente longa", deviceName: "PC" };
    expect(RegisterRequest.safeParse({ ...ok, email: "not-an-address" }).success).toBe(false);
    expect(RegisterRequest.safeParse({ ...ok, password: "curta" }).success).toBe(false);
    expect(RegisterRequest.safeParse({ ...ok, admin: true }).success).toBe(false);
  });

  it("does not apply the password rules at login", () => {
    expect(LoginRequest.safeParse({ email: "a@b.pt", password: "curta", deviceName: "PC" }).success).toBe(true);
  });
});

describe("accepting a new vault version", () => {
  it("accepts the next version of the sender's own vault", async () => {
    const text = await vault("user_a", 3);
    expect(checkVaultPut({ sessionUserId: "user_a", currentVersion: 2,
      body: { vaultVersion: 3, expectedVersion: 2, text } })).toEqual({ ok: true });
  });

  it("answers a stale send with 409, so the device reads, merges and sends again", async () => {
    const text = await vault("user_a", 3);
    const decision = checkVaultPut({ sessionUserId: "user_a", currentVersion: 4,
      body: { vaultVersion: 3, expectedVersion: 2, text } });
    expect(decision).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a vault sealed for another account", async () => {
    const text = await vault("user_b", 3);
    expect(checkVaultPut({ sessionUserId: "user_a", currentVersion: 2,
      body: { vaultVersion: 3, expectedVersion: 2, text } })).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a request whose version disagrees with the vault inside it", async () => {
    const text = await vault("user_a", 5);
    expect(checkVaultPut({ sessionUserId: "user_a", currentVersion: 2,
      body: { vaultVersion: 3, expectedVersion: 2, text } })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a version that skips ahead, and text that is not a vault", async () => {
    const text = await vault("user_a", 4);
    expect(checkVaultPut({ sessionUserId: "user_a", currentVersion: 2,
      body: { vaultVersion: 4, expectedVersion: 2, text } })).toMatchObject({ ok: false, status: 400 });
    expect(checkVaultPut({ sessionUserId: "user_a", currentVersion: 0,
      body: { vaultVersion: 1, expectedVersion: 0, text: "hello" } })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("repeated wrong passwords", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");

  it("does not lock before the limit", () => {
    let state = { failedLogins: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) state = afterFailedLogin(state.failedLogins, now);
    expect(state).toEqual({ failedLogins: MAX_FAILED_LOGINS - 1, lockedUntil: null });
  });

  it("locks for a while at the limit and starts counting again", () => {
    const state = afterFailedLogin(MAX_FAILED_LOGINS - 1, now);
    expect(state.failedLogins).toBe(0);
    expect(state.lockedUntil!.getTime() - now.getTime()).toBe(LOCKOUT_MINUTES * 60 * 1000);
    expect(lockedUntil(state, now)).toEqual(state.lockedUntil);
  });

  it("lets the lock expire", () => {
    const state = afterFailedLogin(MAX_FAILED_LOGINS - 1, now);
    const later = new Date(state.lockedUntil!.getTime() + 1);
    expect(lockedUntil(state, later)).toBeNull();
  });
});
