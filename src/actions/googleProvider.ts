// Internal protocol adapter, never a callable Server Action. Network belongs here.
import * as oidc from "openid-client";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { GOOGLE_ERRORS, GOOGLE_ISSUER, type GoogleConfiguration } from "@/lib/accounts/google";

export type GoogleIdentity = { subject: string; email: string };
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });
const configurations = new Map<string, Promise<oidc.Configuration>>();

async function provider(settings: GoogleConfiguration) {
  const key = settings.clientId + "|" + settings.clientSecret;
  let pending = configurations.get(key);
  if (!pending) {
    configurations.clear();
    pending = oidc.discovery(new URL(GOOGLE_ISSUER), settings.clientId, settings.clientSecret, undefined, { timeout: 5 });
    configurations.set(key, pending);
    pending.catch(() => configurations.delete(key));
  }
  return pending;
}

export function googleClaims(claims: Record<string, unknown>, nonce: string, clients: string[]): GoogleIdentity {
  if (claims.nonce !== nonce || claims.email_verified !== true || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255
    || typeof claims.email !== "string" || claims.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
    || (claims.azp !== undefined && (typeof claims.azp !== "string" || !clients.includes(claims.azp)))) throw new Error(GOOGLE_ERRORS.failed);
  return { subject: claims.sub, email: claims.email.trim().toLowerCase() };
}

export async function googleAuthorizationUrl(settings: GoogleConfiguration, state: string, nonce: string, verifier: string, configuration?: oidc.Configuration): Promise<string> {
  return oidc.buildAuthorizationUrl(configuration ?? await provider(settings), {
    redirect_uri: settings.origin + "/api/auth/google/callback", response_type: "code", scope: "openid email",
    state, nonce, code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256", prompt: "select_account",
  }).href;
}

export async function googleCodeIdentity(settings: GoogleConfiguration, url: URL, state: string, nonce: string, verifier: string, configuration?: oidc.Configuration): Promise<GoogleIdentity> {
  const tokens = await oidc.authorizationCodeGrant(configuration ?? await provider(settings), url, { expectedState: state, expectedNonce: nonce, pkceCodeVerifier: verifier, idTokenExpected: true });
  const claims = tokens.claims();
  if (!claims) throw new Error(GOOGLE_ERRORS.failed);
  return googleClaims(claims as unknown as Record<string, unknown>, nonce, [settings.clientId]);
}

export function googleTokenVerifier(jwks: JWTVerifyGetKey = keys) {
  return async (settings: GoogleConfiguration, token: string, nonce: string): Promise<GoogleIdentity> => {
    const { payload } = await jwtVerify(token, jwks, { issuer: [GOOGLE_ISSUER, "accounts.google.com"], audience: settings.clientId, algorithms: ["RS256"], maxTokenAge: "10m", clockTolerance: 5 });
    return googleClaims(payload, nonce, [settings.clientId, ...settings.androidClients]);
  };
}
export const googleNativeIdentity = googleTokenVerifier();
