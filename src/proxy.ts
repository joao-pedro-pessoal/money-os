import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, endedBy, newSessionValue, readSession, sessionCookieOptions } from "@/lib/auth";
import { sessionsNotBefore } from "@/actions/session";
import { safeReturnPath } from "@/lib/accounts/returnPath";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  /**
   * What is reachable without a session, and why each one has to be.
   *
   * /login is where an account is made or signed into, so it cannot need one.
   *
   * /api/sync is called by a scheduler rather than a browser and enforces its
   * own shared-secret check.
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
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await readSession(cookie ?? null);
  // Whose it is decides which "Log out other devices" can have ended it.
  const ended = session.valid && endedBy(await sessionsNotBefore(session.userId), session.issuedAt);

  if (!session.valid || ended) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", safeReturnPath(req.nextUrl.pathname + req.nextUrl.search));
    return NextResponse.redirect(loginUrl);
  }

  /**
   * A session in use is renewed once a day, so only one left idle for the
   * whole of `SESSION_MAX_AGE_SECONDS` expires. The phone app's widgets store
   * the renewed cookie too (Site.java), so they keep working between visits.
   */
  const response = NextResponse.next();
  if (session.renew) {
    response.cookies.set(SESSION_COOKIE_NAME, await newSessionValue(session.userId), sessionCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/public|_next/static|_next/image|favicon.ico).*)"],
};
