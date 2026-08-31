// Single-user auth gate. No accounts table, no multi-tenancy (MVP_SPEC.md §0).
// Session cookie = HMAC-SHA256(secret, "authenticated") computed with Web Crypto,
// so it works in the Edge middleware runtime without Node-only crypto APIs.

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

export async function expectedSessionValue(): Promise<string> {
  return hmac(required("APP_SECRET"), "authenticated");
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
 * Done this way rather than with `timingSafeEqual` because this module is
 * imported by the Edge middleware, where Node's `crypto` is not available.
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
