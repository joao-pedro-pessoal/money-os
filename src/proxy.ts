import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, newSessionValue, readSession, sessionCookieOptions } from "@/lib/auth";
import { sessionsNotBefore } from "@/actions/session";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  /**
   * What is reachable without a session, and why each one has to be.
   *
   * /api/sync is called by a scheduler rather than a browser and enforces its
   * own shared-secret check.
   *
   * /api/vault is the encrypted-sync server. Devices authenticate with their own
   * bearer tokens, per account, and every handler checks one before touching a
   * row. The site's cookie would be the wrong credential there: it proves someone
   * knows the single-user password and names no account. Nothing under it reads
   * the single-user tables — an account made there can store and fetch its own
   * ciphertext and nothing else.
   *
   * The rest is what an installed app needs before anyone has logged in. The
   * browser fetches the manifest and registers the service worker outside any
   * page's session, and the offline page is served precisely when nothing can
   * be checked with the server. Behind the redirect, all four returned 307 to
   * /login and the app could not be installed at all.
   *
   * None of them carries data: an icon, a name, a colour, a worker that caches
   * one static page. Every screen with a figure on it stays behind the cookie.
   */
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/sync") ||
    pathname === "/api/vault" ||
    pathname.startsWith("/api/vault/") ||
    /**
     * A vault account is not this installation's owner: it has its own email
     * and password at the sync server, and the site's single-user cookie would
     * be the wrong credential entirely. The page it opens carries no data —
     * everything on it is decrypted in the browser from the account's own vault.
     */
    pathname === "/vault" ||
    pathname.startsWith("/vault/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = cookie ? await readSession(cookie, new Date(), await sessionsNotBefore()) : { valid: false as const };

  if (!session.valid) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  /**
   * A session in use is renewed once a day, so only one left idle for the
   * whole of `SESSION_MAX_AGE_SECONDS` expires. The phone app's widgets store
   * the renewed cookie too (Site.java), so they keep working between visits.
   */
  const response = NextResponse.next();
  if (session.renew) {
    response.cookies.set(SESSION_COOKIE_NAME, await newSessionValue(), sessionCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/public|_next/static|_next/image|favicon.ico).*)"],
};
