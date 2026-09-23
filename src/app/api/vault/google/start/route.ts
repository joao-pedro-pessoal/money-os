import { NextResponse } from "next/server";
import { authorizeUrl, googleConfig, HANDOFF_SECONDS, startValues } from "@/lib/vault/google";

export const dynamic = "force-dynamic";

/** The cookie carrying this sign-in's one-time secrets while the person is at Google. */
export const PENDING_COOKIE = "vault_google_pending";

/**
 * Sends someone to Google to prove who they are.
 *
 * The verifier, the state and the nonce stay here, in a cookie the page's
 * JavaScript cannot read and which lasts minutes. Only the challenge — a hash
 * of the verifier — travels, so a code intercepted on the way back cannot be
 * exchanged by anyone but this server.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const config = googleConfig(process.env, origin);
  if (!config) {
    return NextResponse.json(
      { reason: "This server has no Google sign-in configured. Its owner sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const values = await startValues((length) => crypto.getRandomValues(new Uint8Array(length)));
  const response = NextResponse.redirect(authorizeUrl(config, values), { status: 302 });
  response.cookies.set(PENDING_COOKIE, JSON.stringify(values), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/api/vault/google",
    maxAge: HANDOFF_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
