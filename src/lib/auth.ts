// Sessions: who is signed in, carried in a cookie signed with HMAC-SHA256
// under APP_SECRET using Web Crypto, so the same code runs in the proxy, in
// server actions and in the database pool that reads it (src/db/client.ts).

const COOKIE_NAME = "moneyos_session";

/**
 * A missing secret is refused, never defaulted.
 *
 * These two used to fall back to `"dev-secret-change-me"` and `"changeme"`. The
 * repository is public — AGPL — so both values are known to anyone who can read
 * this file, which made an instance started without a `.env` openable by
 * anybody who found it, with a session cookie they could compute themselves.
 *
 * `docker-compose.yml` catches it with `${APP_PASSWORD:?…}`, but that guard
 * lives in the deployment and the README also offers "on your own machine",
 * where `npm start` had nothing checking at all. The guard belongs here, beside
 * the value it protects.
 *
 * This is the same rule the rest of the app already follows: `deriveKey` throws
 * without `ENCRYPTION_KEY`, and `/api/sync` answers 503 without `SYNC_SECRET`.
 * A secret is a measurement like any other, and absence is not zero.
 */
function required(name: "APP_SECRET" | "APP_PASSWORD"): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and generate one with ` +
        `\`openssl rand -base64 32\`. The app will not start without it, ` +
        `because the alternative is a password everybody already knows.`
    );
  }
  return value;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Buffer.from(sig).toString("hex");
}

/**
 * Compares two secrets without leaking how much of one matched the other.
 *
 * `===` on strings stops at the first differing character, so how long it takes
 * depends on the length of the correct prefix. Both sides are run through an
 * HMAC under a key generated for this one comparison first: whatever went in,
 * what gets compared is 64 hex characters that reveal nothing about the input,
 * and two of them are equal only if the inputs were.
 *
 * Done this way rather than with `timingSafeEqual` so this module keeps to Web
 * Crypto and runs unchanged wherever the proxy is run.
 */
async function equalsInConstantTime(a: string, b: string): Promise<boolean> {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const [left, right] = await Promise.all([hmac(key, a), hmac(key, b)]);
  return left === right;
}

/**
 * The owner's password, for the one check that uses it: the owner's first
 * sign-in, which claims the owner's account (actions/auth.ts).
 *
 * The page sends a key derived from the password (lib/accounts/credentials.ts)
 * and the claim derives the same key from this to compare. Only that limited
 * sign-in may call this — a second caller would be a way round its limit on
 * guessing, which src/lib/__tests__/site-login.test.ts checks.
 */
export function ownerPassword(): string {
  return required("APP_PASSWORD");
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * A session, and how long one lasts.
 *
 * Each sign-in gets its own value — a version, whose session it is, the moment
 * it was issued, a random nonce, and a signature over all four. It is refused
 * once it is older than `SESSION_MAX_AGE_SECONDS`, or issued before that
 * person last pressed "Log out other devices" (checked by the proxy, which
 * reads the date from their row). No session table: the signature proves it
 * was issued here, and the date is what ends it. The proxy renews a session
 * once it is a day old, so someone using the site is never thrown out, and
 * one left idle for thirty days is.
 *
 * "v2" sessions are from before there were accounts. Only the owner could hold
 * one, so they are read as the owner's — publishing accounts signs nobody out.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;
/** A clock a little ahead of this one should not make a fresh session invalid. */
const CLOCK_SKEW_SECONDS = 5 * 60;
const SESSION_VERSION = "v3";
/** Whose session a "v2" cookie is: the one account there was. Same value as OWNER_USER_ID in the schema. */
const V2_USER_ID = "owner";
/** An account id as the schema makes them (cuid2), or the owner's. */
const USER_ID = /^[a-z0-9]{1,40}$/;

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const signSession = (body: string) => hmac(required("APP_SECRET"), `session|${body}`);

/** A new session for this account, issued at `now`. */
export async function newSessionValue(userId: string, now: Date = new Date()): Promise<string> {
  if (!USER_ID.test(userId)) throw new Error("That is not an account id.");
  const issued = Math.floor(now.getTime() / 1000);
  const body = `${SESSION_VERSION}.${userId}.${issued}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
  return `${body}.${await signSession(body)}`;
}

export type SessionCheck =
  | { valid: false }
  | { valid: true; userId: string; issuedAt: Date; renew: boolean };

/**
 * Whether a cookie value is a session this site issued, still in date, and
 * whose. "Log out other devices" is the caller's to apply, with
 * `endedBy` and the date on that person's row.
 */
export async function readSession(value: string | null | undefined, now: Date = new Date()): Promise<SessionCheck> {
  const v3 = /^(v3)\.([a-z0-9]{1,40})\.(\d{1,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(value ?? "");
  const v2 = v3 ? null : /^(v2)\.(\d{1,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(value ?? "");
  let userId: string, issued: string, body: string, signature: string;
  if (v3) {
    [, , userId, issued, , signature] = v3;
    body = `${v3[1]}.${userId}.${issued}.${v3[4]}`;
  } else if (v2) {
    userId = V2_USER_ID;
    [, , issued, , signature] = v2;
    body = `${v2[1]}.${issued}.${v2[3]}`;
  } else {
    return { valid: false };
  }
  if (!(await equalsInConstantTime(signature, await signSession(body)))) return { valid: false };
  const issuedSeconds = Number(issued);
  const age = Math.floor(now.getTime() / 1000) - issuedSeconds;
  if (age < -CLOCK_SKEW_SECONDS || age > SESSION_MAX_AGE_SECONDS) return { valid: false };
  return { valid: true, userId, issuedAt: new Date(issuedSeconds * 1000), renew: age > SESSION_RENEW_AFTER_SECONDS };
}

/**
 * Whether "Log out other devices", pressed at `notBefore`, ended a session
 * issued at `issuedAt`. Compared in whole seconds: a session issued in that
 * same second stands, which is what lets the device that pressed it be given
 * a fresh one at once.
 */
export function endedBy(notBefore: Date | null, issuedAt: Date): boolean {
  return notBefore !== null && Math.floor(issuedAt.getTime() / 1000) < Math.floor(notBefore.getTime() / 1000);
}

/** How the session cookie is set, wherever it is set. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // "true" when served over HTTPS, e.g. behind a TLS-terminating proxy.
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
