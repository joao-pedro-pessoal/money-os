import type { VaultSession } from "@/lib/vault/client";

/**
 * Where a vault's two secrets are kept on this device, and for how long.
 *
 * The session token goes in `localStorage`: it proves who the account is and
 * unlocks nothing. The twelve words go in `sessionStorage` by default, which
 * the browser drops when the tab closes — a key that outlives the tab is a key
 * left in the door of a shared computer.
 *
 * On a phone that default makes the vault useless: an installed web app loses
 * its `sessionStorage` every time it is closed, so every opening meant typing
 * twelve words. So a person may say this device is theirs, and then the words
 * stay in `localStorage` until "Lock and sign out". It is a choice made on the
 * screen, never the default on a computer, and signing out forgets both.
 *
 * Every access is wrapped: storage can be switched off or full, and a page that
 * cannot remember must still work for as long as it is open.
 */

const SESSION_KEY = "money-os-vault-session";
const SEED_KEY = "money-os-vault-seed";
const KEPT_SEED_KEY = "money-os-vault-seed-kept";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Not remembered, which the page survives.
  }
}

const local = () => window.localStorage;
const tab = () => window.sessionStorage;

/** Whether this device was told to keep the vault open. */
export function isKept(): boolean {
  return read(local, KEPT_SEED_KEY) !== null;
}

/** Remembers a vault that is open now, for the length `keep` says. */
export function rememberVault(session: VaultSession, words: string, keep: boolean): void {
  write(local, SESSION_KEY, JSON.stringify(session));
  write(tab, SEED_KEY, words);
  write(local, KEPT_SEED_KEY, keep ? words : null);
}

/** The vault this device can reopen without asking, or null. */
export function recallVault(): { session: VaultSession; words: string } | null {
  const raw = read(local, SESSION_KEY);
  const words = read(tab, SEED_KEY) ?? read(local, KEPT_SEED_KEY);
  if (!raw || !words) return null;
  try {
    const session = JSON.parse(raw) as VaultSession;
    if (typeof session.token !== "string" || typeof session.userId !== "string") return null;
    return { session, words };
  } catch {
    return null;
  }
}

/** Forgets both secrets on this device. */
export function forgetVault(): void {
  write(local, SESSION_KEY, null);
  write(tab, SEED_KEY, null);
  write(local, KEPT_SEED_KEY, null);
}
