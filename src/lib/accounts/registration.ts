import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { sameKey } from "./credentials";

type Environment = { [key: string]: string | undefined };
export type RegistrationMode = "open" | "invite" | "closed";

/** Unset preserves existing installations; a misspelled mode fails closed. */
export function registrationMode(env: Environment): RegistrationMode {
  const mode = env.REGISTRATION_MODE?.trim();
  if (mode === undefined || mode === "") return "open";
  return mode === "open" || mode === "invite" ? mode : "closed";
}

export function hasInviteSecret(env: Environment): boolean {
  const length = env.REGISTRATION_INVITE_CODE?.trim().length ?? 0;
  return length >= 32 && length <= 256;
}

/** Runs before any database read or expensive password hash. */
export function registrationAccess(env: Environment, supplied?: string): string | null {
  const mode = registrationMode(env);
  if (mode === "open") return null;
  if (mode === "closed" || !hasInviteSecret(env)) return "New accounts are closed on this site.";
  const digest = (value: string) => bytesToHex(sha256(utf8ToBytes(value)));
  if (!supplied || supplied.length > 256 || !sameKey(digest(supplied.trim()), digest(env.REGISTRATION_INVITE_CODE!.trim()))) {
    return "A valid invitation code is required to create an account.";
  }
  return null;
}
