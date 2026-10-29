import { signUp } from "@/actions/auth";
import { REGISTRATION_INVALID, REGISTRATION_UNAVAILABLE } from "@/lib/accounts/botProtection";
import { TOO_MANY_ATTEMPTS } from "@/lib/accounts/attempts";

export const dynamic = "force-dynamic";
const MAX_BYTES = 4096;
const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const invalid = (status: number) => reply({ kind: "refused", reason: REGISTRATION_INVALID }, status);

/** A dedicated route lets BotID challenge registration without intercepting password sign-in/recovery. */
export async function POST(request: Request) {
  // Route Handlers do not inherit Server Actions' origin protection.
  const origin = request.headers.get("origin");
  try {
    // Next can expose its internal hostname in request.url. Host is the browser-facing
    // authority, as in Server Actions' own CSRF check; do not trust X-Forwarded-Host.
    const target = new URL(request.url);
    const expected = new URL(`${target.protocol}//${request.headers.get("host") ?? target.host}`);
    if (!origin || origin === "null" || new URL(origin).origin !== expected.origin) return invalid(403);
  } catch { return invalid(403); }
  if (request.headers.get("sec-fetch-site") === "cross-site") return invalid(403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return invalid(415);
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return invalid(413);

  let raw: unknown;
  const reader = request.body?.getReader();
  if (!reader) return invalid(400);
  try {
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); return invalid(413); }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch { return invalid(400); }
  finally { reader.releaseLock(); }

  try {
    // signUp validates the schema, invitation, origin rate limit and BotID before creating an account.
    const outcome = await signUp(raw);
    return reply(outcome, outcome.kind === "ok" ? 200 : outcome.reason === TOO_MANY_ATTEMPTS ? 429 : 400);
  } catch {
    return reply({ kind: "refused", reason: REGISTRATION_UNAVAILABLE }, 503);
  }
}
