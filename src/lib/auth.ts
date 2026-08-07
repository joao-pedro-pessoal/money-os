// Single-user auth gate. No accounts table, no multi-tenancy (MVP_SPEC.md §0).
// Session cookie = HMAC-SHA256(secret, "authenticated") computed with Web Crypto,
// so it works in the Edge middleware runtime without Node-only crypto APIs.

const COOKIE_NAME = "moneyos_session";

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
  const secret = process.env.APP_SECRET || "dev-secret-change-me";
  return hmac(secret, "authenticated");
}

export async function checkPassword(password: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD || "changeme";
  return password === expected;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
