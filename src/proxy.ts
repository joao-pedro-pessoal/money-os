import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, endedBy, newSessionValue, readSession, sessionCookieOptions } from "@/lib/auth";
import { sessionsNotBefore } from "@/actions/session";
import { safeReturnPath } from "@/lib/accounts/returnPath";
import { isPublicPath } from "@/lib/accounts/publicPaths";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) {
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
