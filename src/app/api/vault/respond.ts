import { NextResponse } from "next/server";
import { bearerToken } from "@/lib/vault/session";
import { MAX_SYNC_BODY_BYTES } from "@/lib/vault/cipher";

/**
 * The HTTP edge of the sync server, shared by its routes.
 *
 * Routes stay thin: read the body, hand it to the action, turn the action's answer
 * into a status. Every response carries `no-store`, because several of them hold
 * a session token and none of them should ever be served from a cache.
 */

/**
 * The most a sign-in or registration may weigh.
 *
 * An address, a password and a device name. Nothing legitimate comes near
 * this, and the routes behind it are the expensive ones — each runs a key
 * derivation deliberately built to be slow.
 */
export const MAX_CREDENTIAL_BODY_BYTES = 64 * 1024;

/** What reading a body produced, or why it produced nothing. */
export type ReadBody = { ok: true; body: unknown } | { ok: false; why: "not-json" | "too-large" };

/**
 * The parsed body, never more than `MAX_SYNC_BODY_BYTES` of it.
 *
 * `request.json()` reads whatever is sent: Next imposes no limit on a route
 * handler's body, so a request with no credentials at all could hand the
 * process gigabytes and have them parsed into memory before anything refused
 * it. The bytes are counted as they arrive and the stream is dropped the
 * moment it goes over, so the cost of an oversized request is the cost of the
 * first few megabytes and nothing more.
 *
 * A declared `Content-Length` is checked first, which refuses the ordinary
 * case without reading anything — but it is the sender's word, so it is not
 * the only check.
 */
export async function readJson(request: Request, maxBytes = MAX_SYNC_BODY_BYTES): Promise<ReadBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, why: "too-large" };

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, why: "not-json" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, why: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, why: "not-json" };
  }

  const text = new TextDecoder().decode(concat(chunks, size));
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, why: "not-json" };
  }
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
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

export function tooLarge(): NextResponse {
  return json({ error: "That is larger than a vault is allowed to be." }, 413);
}

/** The answer to a body that could not be read, whichever way it failed. */
export function unreadable(read: { why: "not-json" | "too-large" }): NextResponse {
  return read.why === "too-large" ? tooLarge() : notJson();
}

/**
 * The refusal for a request carrying no token at all.
 *
 * Checked in the route, before the body is read, which is the whole point: an
 * unauthenticated flood should cost a header lookup, not a megabyte of parsing
 * each. It says nothing a valid token would not — the actions still
 * authenticate every token themselves, and a wrong one is refused there in the
 * same words.
 */
export const NO_TOKEN = { status: 401, reason: "Sign in again: this device's session is not valid." };
