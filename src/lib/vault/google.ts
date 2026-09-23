/**
 * Signing in to a vault account with Google.
 *
 * Google answers one question — which person is at the keyboard — and no other.
 * It cannot open a vault: the twelve words are still what decrypts it, and they
 * never reach Google or this server. So "sign in with Google" removes a
 * password to remember, not the words to keep.
 *
 * The flow is the standard authorization code one, with PKCE. What matters for
 * safety, and is done here:
 *
 * - `state` ties the answer to the request this browser started, so another
 *   site cannot have Google hand us a code it obtained for someone else.
 * - `nonce` ties the identity token to that same request, against a replayed one.
 * - the code is exchanged **by the server, directly with Google, over TLS**.
 *   A token that arrives that way is trusted without checking its signature —
 *   Google's own guidance — because nobody stood between the two.
 *
 * Pure: the network calls live in the routes; everything decided is decided here.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** How long a started sign-in stays valid. Long enough to type a password at Google. */
export const HANDOFF_SECONDS = 600;

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** Must match one of the redirect URIs registered in the Google project, exactly. */
  redirectUri: string;
}

/** The configuration, or null when this server has not been given one. */
export function googleConfig(
  env: { [key: string]: string | undefined },
  origin: string
): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  // The address Google returns to has to be one this server actually answers
  // on, and https everywhere but on a machine's own loopback.
  const redirectUri = `${env.GOOGLE_REDIRECT_ORIGIN?.trim() || origin}/api/vault/google/callback`;
  return { clientId, clientSecret, redirectUri };
}

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/**
 * The one-time secrets a sign-in carries: a verifier only this browser's server
 * session knows, its challenge for Google, a state and a nonce.
 */
export async function startValues(random: (length: number) => Uint8Array): Promise<{
  verifier: string;
  challenge: string;
  state: string;
  nonce: string;
}> {
  const verifier = base64url(random(32));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64url(new Uint8Array(digest)),
    state: base64url(random(16)),
    nonce: base64url(random(16)),
  };
}

export function authorizeUrl(
  config: GoogleConfig,
  values: { challenge: string; state: string; nonce: string }
): string {
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: values.state,
    nonce: values.nonce,
    code_challenge: values.challenge,
    code_challenge_method: "S256",
    // An account chooser every time: several people share one browser far more
    // often than they share one Google account.
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${query}`;
}

export function tokenRequestBody(config: GoogleConfig, code: string, verifier: string): string {
  return new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  }).toString();
}

export interface GoogleIdentity {
  /** Google's stable id for the person. The email can change; this does not. */
  subject: string;
  email: string;
}

export class GoogleSignInError extends Error {}

/** The payload of a JWT, without checking the signature. See the file's note. */
export function idTokenPayload(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleSignInError("Google returned something that is not an identity token.");
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
  } catch {
    throw new GoogleSignInError("Google's identity token could not be read.");
  }
}

/**
 * Who Google says this is, once every claim that ties the token to this request
 * has been checked. A token for another application, an expired one, or one
 * answering a different sign-in is refused rather than half-trusted.
 */
export function identityFrom(
  payload: Record<string, unknown>,
  expected: { clientId: string; nonce: string },
  now: Date
): GoogleIdentity {
  const text = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);
  const number = (key: string) => (typeof payload[key] === "number" ? (payload[key] as number) : null);

  if (!ISSUERS.has(text("iss") ?? "")) throw new GoogleSignInError("That identity token did not come from Google.");
  if (text("aud") !== expected.clientId) throw new GoogleSignInError("That identity token was issued for another application.");
  if (text("nonce") !== expected.nonce) throw new GoogleSignInError("That sign-in does not answer the one started here.");
  const expires = number("exp");
  if (expires === null || expires * 1000 <= now.getTime()) throw new GoogleSignInError("Google's answer has expired. Try again.");
  const subject = text("sub");
  const email = text("email")?.trim().toLowerCase() ?? null;
  if (!subject || !email) throw new GoogleSignInError("Google did not say who this is.");
  if (payload.email_verified === false) {
    throw new GoogleSignInError("That Google account has no confirmed email address.");
  }
  return { subject, email };
}
