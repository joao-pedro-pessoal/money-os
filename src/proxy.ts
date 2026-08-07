import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, expectedSessionValue } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /api/sync is exempt from the session cookie on purpose: it's called by a
  // scheduler, not a browser, and enforces its own shared-secret check.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/sync")
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
