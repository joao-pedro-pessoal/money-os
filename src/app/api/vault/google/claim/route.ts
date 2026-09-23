import { NextResponse } from "next/server";
import { HANDOFF_COOKIE } from "../callback/route";

export const dynamic = "force-dynamic";

/**
 * Hands the page the session Google's sign-in opened, exactly once.
 *
 * The cookie is cleared in the same answer that carries the token, so a second
 * call — a refresh, a back button, another tab — gets nothing. POST rather than
 * GET for the same reason a form is not a link: this consumes something.
 */
export async function POST(request: Request) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${HANDOFF_COOKIE}=`))
    ?.slice(HANDOFF_COOKIE.length + 1);

  const response = raw
    ? NextResponse.json(JSON.parse(decodeURIComponent(raw)), { status: 200 })
    : NextResponse.json({ reason: "Nothing to claim. Start the sign-in again." }, { status: 404 });
  response.cookies.delete({ name: HANDOFF_COOKIE, path: "/api/vault/google" });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
