/** Pure Google configuration and protocol boundaries. No network or database. */
export const GOOGLE_ISSUER = "https://accounts.google.com";
export const GOOGLE_COOKIE = "moneyos_google_request";
export const GOOGLE_TTL_SECONDS = 300;
export const GOOGLE_PROOF_SECONDS = 60;
export const GOOGLE_PATH = "/api/auth/google";
export const GOOGLE_REGISTER_PATH = "/api/register/google";
export const GOOGLE_PURPOSES = ["delete", "recovery-code", "set-password"] as const;
export type GooglePurpose = typeof GOOGLE_PURPOSES[number];
export type GoogleAccountState = { enabled: boolean; hasPassword: boolean; linked: boolean; email: string | null; confirmation: GooglePurpose | null };
export const GOOGLE_TOKEN = /^[a-f0-9]{64}$/;
export type GoogleConfiguration = { origin: string; clientId: string; clientSecret: string; androidClients: string[] };

export function googleConfiguration(env: Record<string, string | undefined>): GoogleConfiguration | null {
  if (env.GOOGLE_LOGIN_ENABLED !== "true") return null;
  const origin = env.GOOGLE_AUTH_ORIGIN?.trim();
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!origin || !clientId || !clientSecret || !clientId.endsWith(".apps.googleusercontent.com")) return null;
  try {
    const url = new URL(origin);
    const local = env.VERCEL !== "1" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.origin !== origin || url.username || url.password || (!local && url.protocol !== "https:")) return null;
  } catch { return null; }
  return { origin, clientId, clientSecret, androidClients: (env.GOOGLE_ANDROID_CLIENT_IDS ?? "").split(",").map(x => x.trim()).filter(Boolean) };
}

export const GOOGLE_ERRORS = {
  unavailable: "Google sign-in is unavailable. Use another sign-in method.",
  expired: "This Google request expired or changed. Start again.",
  failed: "Could not verify Google sign-in. Start again.",
  conflict: "Sign in with your existing method, then link Google in Settings. Accounts are never joined by email.",
  linked: "This Google account is already linked to another Money OS account.",
  password: "Confirm your current Money OS password first.",
  last: "Set a Money OS password before disconnecting Google.",
} as const;

/** Only our fixed user-facing refusals may leave an authentication endpoint. */
export function safeGoogleError(error: unknown): string {
  const messages: string[] = [...Object.values(GOOGLE_ERRORS), "Too many attempts. Try again later.", "Log out before signing into another account, or link Google in Settings.",
    "New accounts are closed on this site.", "A valid invitation code is required to create an account.", "This site is not taking new accounts at the moment.",
    "Too many new accounts recently. Try again later.", "Could not verify this registration. Reload the page and try again.", "An account with this email already exists. Sign in instead."];
  return error instanceof Error && messages.includes(error.message) ? error.message : GOOGLE_ERRORS.failed;
}

export function googleProofFresh(verifiedAt: Date | null, expiresAt: Date, now: Date): boolean {
  return verifiedAt !== null && verifiedAt <= now && now.getTime() - verifiedAt.getTime() <= GOOGLE_PROOF_SECONDS * 1000 && expiresAt > now;
}
