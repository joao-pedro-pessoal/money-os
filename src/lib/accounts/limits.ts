/**
 * How often a password may be guessed, and how many accounts the site takes.
 * Decided without a database, so both are tested as plain functions; the
 * actions in actions/auth.ts apply them.
 */

/** Ten wrong passwords in a row lock an account's sign-in for fifteen minutes. */
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

/**
 * How many accounts the site takes, and how fast.
 *
 * Registration is open — the app is published — but not without end: every
 * account costs database space and a slow hash to make, so the total is set by
 * `MAX_ACCOUNTS` (ten when unset), and a burst of sign-ups is slowed whatever
 * the total. Raising the limit is a decision written in the environment.
 */
export const REGISTRATIONS_PER_HOUR = 5;
export const REGISTRATIONS_PER_DAY = 20;
export const DEFAULT_MAX_ACCOUNTS = 10;

/**
 * The configured limit, or null when it is set to something that is not a
 * whole number of at least one — which closes registration: a limit nobody
 * can read is not permission for no limit. `SYNC_MAX_ACCOUNTS` is its older
 * name, still read so an existing setting keeps working.
 */
export function maxAccounts(env: { [name: string]: string | undefined }): number | null {
  const value = env.MAX_ACCOUNTS ?? env.SYNC_MAX_ACCOUNTS;
  if (value === undefined || value.trim() === "") return DEFAULT_MAX_ACCOUNTS;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** Why a new account cannot be made now, or null when it can. */
export function registrationRefusal(
  counts: { total: number; lastHour: number; lastDay: number },
  limit: number | null
): string | null {
  if (limit === null) return "New accounts are closed on this site.";
  if (counts.total >= limit) return "This site is not taking new accounts at the moment.";
  if (counts.lastHour >= REGISTRATIONS_PER_HOUR || counts.lastDay >= REGISTRATIONS_PER_DAY) {
    return "Too many new accounts recently. Try again later.";
  }
  return null;
}
