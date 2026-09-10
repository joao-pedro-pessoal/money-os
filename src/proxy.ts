import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, expectedSessionValue } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  /**
   * What is reachable without a session, and why each one has to be.
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
  const expected = await expectedSessionValue();

  if (cookie !== expected) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/public|_next/static|_next/image|favicon.ico).*)"],
};
