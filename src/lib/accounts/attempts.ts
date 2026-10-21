import { createHmac } from "node:crypto";

/**
 * How many times one connection may try to sign in, make an account or use a
 * recovery code, before anyone is signed in.
 *
 * The other limits count per account (ten wrong passwords lock it) or for the
 * whole site (five new accounts an hour). Neither stops one connection from
 * using up the site's new-account allowance, or from keeping the two slow
 * password checks busy with guesses at addresses that do not exist. These do,
 * and are generous enough for a household behind one router.
 */
export const ATTEMPT_LIMITS = {
  "sign-in": [{ minutes: 10, max: 30 }],
  "sign-up": [
    { minutes: 60, max: 5 },
    { minutes: 24 * 60, max: 10 },
  ],
  recover: [{ minutes: 60, max: 10 }],
  // Each QR request holds one of a fixed number of slots for five minutes.
  qr: [{ minutes: 10, max: 20 }],
} as const;

export type AttemptAction = keyof typeof ATTEMPT_LIMITS;

export const TOO_MANY_ATTEMPTS = "Too many attempts from this connection. Try again later.";

/** Long enough for the longest window above; older rows are deleted. */
export const ATTEMPT_RETENTION_HOURS = 24;

/**
 * The connection's address as the host reports it, or null when there is none
 * to go by.
 *
 * On Vercel both headers are written by the platform, not the browser. Where
 * the site runs without such a host (the home copy on the Wi-Fi) they are
 * absent, and a connection is not limited here at all — the per-account and
 * site-wide limits still apply. A header a client could forge is no worse
 * than none: it can only move its own attempts to another count.
 */
export function clientAddress(headers: { get(name: string): string | null }): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded.slice(0, 64) : null;
}

/**
 * A one-way fingerprint of the address. The same address always gives the same
 * value, so attempts can be counted; without the app's secret the value does
 * not lead back to the address, so the table holds no address at all.
 */
export function originOf(address: string, secret: string): string {
  return createHmac("sha256", secret).update(address).digest("hex").slice(0, 32);
}

/** Whether one more attempt would go over a limit, given how many there were in each window. */
export function overLimit(action: AttemptAction, recent: readonly number[]): boolean {
  return ATTEMPT_LIMITS[action].some((limit, i) => (recent[i] ?? 0) >= limit.max);
}
