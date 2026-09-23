import { NextResponse } from "next/server";
import { signInWithGoogle } from "@/actions/vaultServer";
import {
  googleConfig,
  GoogleSignInError,
  HANDOFF_SECONDS,
  identityFrom,
  idTokenPayload,
  TOKEN_ENDPOINT,
  tokenRequestBody,
} from "@/lib/vault/google";
import { PENDING_COOKIE } from "../start/route";

export const dynamic = "force-dynamic";

/** The cookie the page trades for its session, once and immediately. */
export const HANDOFF_COOKIE = "vault_google_handoff";

/** Back to the vault with something to say, rather than a blank page. */
function back(origin: string, problem: string) {
  const url = new URL("/vault", origin);
  url.searchParams.set("google_error", problem);
  return NextResponse.redirect(url, { status: 302 });
}

/**
 * Where Google returns the person, with a code this server exchanges.
 *
 * The session it opens is not handed back in the address — a token in a URL
 * lands in history, in the back button and in any log on the way. It goes into
 * a short-lived cookie the page reads once through `claim`, and the address
 * carries nothing but success or a reason.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const config = googleConfig(process.env, origin);
  if (!config) return back(origin, "Google sign-in is not configured on this server.");

  const denied = url.searchParams.get("error");
  if (denied) return back(origin, denied === "access_denied" ? "You did not allow the sign-in." : denied);

  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PENDING_COOKIE}=`))
    ?.slice(PENDING_COOKIE.length + 1);
  if (!raw) return back(origin, "That sign-in took too long, or started in another browser. Try again.");

  let pending: { verifier: string; state: string; nonce: string };
  try {
    pending = JSON.parse(decodeURIComponent(raw));
  } catch {
    return back(origin, "That sign-in could not be matched to this browser. Try again.");
  }

  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== pending.state) {
    return back(origin, "That answer does not match the sign-in started here. Try again.");
  }

  try {
    const exchanged = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: tokenRequestBody(config, code, pending.verifier),
      cache: "no-store",
    });
    if (!exchanged.ok) return back(origin, "Google refused the sign-in. Try again.");
    const body = (await exchanged.json()) as { id_token?: unknown };
    if (typeof body.id_token !== "string") return back(origin, "Google did not say who this is.");

    const identity = identityFrom(
      idTokenPayload(body.id_token),
      { clientId: config.clientId, nonce: pending.nonce },
      new Date()
    );
    const result = await signInWithGoogle(identity, request.headers.get("user-agent")?.slice(0, 60) ?? "Browser");
    if (!result.ok) return back(origin, result.reason);

    const response = NextResponse.redirect(new URL("/vault?google=1", origin), { status: 302 });
    response.cookies.set(
      HANDOFF_COOKIE,
      JSON.stringify({ token: result.token, userId: result.userId, deviceId: result.deviceId, isNew: result.isNew }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: origin.startsWith("https://"),
        path: "/api/vault/google",
        maxAge: HANDOFF_SECONDS,
      }
    );
    response.cookies.delete({ name: PENDING_COOKIE, path: "/api/vault/google" });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof GoogleSignInError) return back(origin, error.message);
    return back(origin, "Google could not be reached. Try again.");
  }
}
