import { NextResponse } from "next/server";
import { bearerToken } from "@/lib/vault/session";

/**
 * The HTTP edge of the sync server, shared by its routes.
 *
 * Routes stay thin: read the body, hand it to the action, turn the action's answer
 * into a status. Every response carries `no-store`, because several of them hold
 * a session token and none of them should ever be served from a cache.
 */

/** The parsed body, or `undefined` when it is not JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function tokenOf(request: Request): string | null {
  return bearerToken(request.headers.get("authorization"));
}

export function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * A response with no body, for a status that must not carry one.
 *
 * `json(null, 204)` reads like "no content" and throws: `NextResponse.json`
 * always writes a body — the text `null` — and the Fetch spec forbids any body on
 * a 204, so the Response constructor refuses it. Inside a route that became a bare
 * 500 with nothing in it, found by the end-to-end check on the first sync of an
 * account with no vault yet.
 */
export function empty(status: 204): NextResponse {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store" } });
}

export function refused(result: { status: number; reason: string }): NextResponse {
  return json({ error: result.reason }, result.status);
}

export function notJson(): NextResponse {
  return json({ error: "The body must be JSON." }, 400);
}
