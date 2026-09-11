import { z } from "zod";
import { readVaultHeader } from "./cipher";
import { PASSWORD_MAX, passwordProblem } from "./password";

/**
 * What the sync server accepts, decided without a database.
 *
 * The server stores ciphertext it cannot read, so everything it can check about a
 * vault is here: that the request is well formed, that the vault claims to belong
 * to the account sending it and to be the version the request says, and that it
 * replaces the version the sender thinks is newest. The last check is repeated
 * inside the database write, where it is atomic — this one exists so a stale send
 * gets a clear answer rather than a constraint error.
 */

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const deviceName = z.string().trim().min(1).max(80);

export const RegisterRequest = z
  .object({
    email,
    password: z.string().max(PASSWORD_MAX).superRefine((password, ctx) => {
      const problem = passwordProblem(password);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
    deviceName,
  })
  .strict();

/** No password rules at login: a policy message there tells an attacker what to try. */
export const LoginRequest = z.object({ email, password: z.string().max(PASSWORD_MAX), deviceName }).strict();

export const PutVaultRequest = z
  .object({
    vaultVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    text: z.string(),
  })
  .strict();
export type PutVaultRequest = z.infer<typeof PutVaultRequest>;

export type PutDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 409; reason: string };

export function checkVaultPut(input: {
  sessionUserId: string;
  currentVersion: number;
  body: PutVaultRequest;
}): PutDecision {
  const { body } = input;
  if (body.vaultVersion !== body.expectedVersion + 1) {
    return { ok: false, status: 400, reason: "A new version must be exactly one above the version it replaces." };
  }

  let header: { userId: string; vaultVersion: number };
  try {
    header = readVaultHeader(body.text);
  } catch (error) {
    return { ok: false, status: 400, reason: error instanceof Error ? error.message : "Not a vault." };
  }
  if (header.userId !== input.sessionUserId) {
    return { ok: false, status: 403, reason: "This vault is sealed for a different account." };
  }
  if (header.vaultVersion !== body.vaultVersion) {
    return {
      ok: false, status: 400,
      reason: `The vault says it is version ${header.vaultVersion}; the request says ${body.vaultVersion}.`,
    };
  }
  if (input.currentVersion !== body.expectedVersion) {
    return {
      ok: false, status: 409,
      reason: `The newest version is ${input.currentVersion}, not ${body.expectedVersion}. Read it, merge, and send again.`,
    };
  }
  return { ok: true };
}

/**
 * Temporary lockout after repeated wrong passwords.
 *
 * The checklist asks for brute-force protection before outside users. Ten failures
 * lock the login method for fifteen minutes and start the count again. A lockout
 * keyed to an address lets someone who knows the address lock its owner out for a
 * while, which is the known cost of this scheme and is preferable to unlimited
 * guessing.
 */
export const MAX_FAILED_LOGINS = 10;
export const LOCKOUT_MINUTES = 15;

export function lockedUntil(state: { lockedUntil: Date | null }, now: Date): Date | null {
  return state.lockedUntil !== null && state.lockedUntil > now ? state.lockedUntil : null;
}

export function afterFailedLogin(
  failedLogins: number,
  now: Date
): { failedLogins: number; lockedUntil: Date | null } {
  const next = failedLogins + 1;
  if (next < MAX_FAILED_LOGINS) return { failedLogins: next, lockedUntil: null };
  return { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000) };
}
