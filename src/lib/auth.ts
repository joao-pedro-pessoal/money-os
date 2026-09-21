// Single-user auth gate. No accounts table, no multi-tenancy (MVP_SPEC.md §0).
// Session cookies are signed with HMAC-SHA256 under APP_SECRET using Web Crypto,
// so the same code runs in the proxy and in server actions.

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

export async function checkPassword(password: string): Promise<boolean> {
  return equalsInConstantTime(password, required("APP_PASSWORD"));
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/**
 * A session, and how long one lasts.
 *
 * The cookie used to be one fixed value, HMAC(secret, "authenticated"): the
 * same on every device, valid forever, and "log out" only deleted the copy in
 * the browser that pressed it. A cookie lifted from any device opened the site
 * until APP_SECRET changed, and nothing could end it.
 *
 * Now each login gets its own value — a version, the moment it was issued, a
 * random nonce, and a signature over the three. It is refused once it is older
 * than `SESSION_MAX_AGE_SECONDS`, or issued before the moment "Log out other
 * devices" was last pressed. Still no session table: the signature is what
 * proves it was issued here, and the date is what ends it. The proxy renews a
 * session once it is a day old, so someone using the site is never thrown
 * out, and one left idle for thirty days is.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60;
/** A clock a little ahead of this one should not make a fresh session invalid. */
const CLOCK_SKEW_SECONDS = 5 * 60;
const SESSION_VERSION = "v2";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

const signSession = (body: string) => hmac(required("APP_SECRET"), `session|${body}`);

/** A new session value, issued at `now`. */
export async function newSessionValue(now: Date = new Date()): Promise<string> {
  const issued = Math.floor(now.getTime() / 1000);
  const body = `${SESSION_VERSION}.${issued}.${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
  return `${body}.${await signSession(body)}`;
}

export type SessionCheck = { valid: false } | { valid: true; issuedAt: Date; renew: boolean };

/**
 * Whether a cookie value is a session this site issued and has not ended.
 *
 * `notBefore` is the moment "Log out other devices" was pressed, in whole
 * seconds; a session issued in that second or after it stands, which is what
 * lets the device that pressed it be given a fresh one at once.
 */
export async function readSession(
  value: string | null | undefined,
  now: Date = new Date(),
  notBefore: Date | null = null
): Promise<SessionCheck> {
  const parts = /^(v2)\.(\d{1,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/.exec(value ?? "");
  if (parts === null) return { valid: false };
  const [, version, issued, nonce, signature] = parts;
  if (!(await equalsInConstantTime(signature, await signSession(`${version}.${issued}.${nonce}`)))) {
    return { valid: false };
  }
  const issuedSeconds = Number(issued);
  const age = Math.floor(now.getTime() / 1000) - issuedSeconds;
  if (age < -CLOCK_SKEW_SECONDS || age > SESSION_MAX_AGE_SECONDS) return { valid: false };
  if (notBefore !== null && issuedSeconds < Math.floor(notBefore.getTime() / 1000)) return { valid: false };
  return { valid: true, issuedAt: new Date(issuedSeconds * 1000), renew: age > SESSION_RENEW_AFTER_SECONDS };
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
