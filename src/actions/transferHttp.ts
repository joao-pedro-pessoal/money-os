import { TransferInputError } from "@/lib/backup/limits";
import { WorkLimitedError } from "./workGate";

export function sameOriginUpload(request: Request, type = "application/json") {
  const url = new URL(request.url);
  // Next's local adapter may normalise request.url to localhost while the
  // browser used 127.0.0.1 or a home LAN address. Host is the browser's actual
  // target and cannot be chosen by a cross-origin fetch.
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") throw new TransferInputError("Invalid origin.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== type) throw new TransferInputError("Invalid content type.", 415);
}

/** Does not trust Content-Length and stops reading as soon as the bound is exceeded. */
export async function boundedBody(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new TransferInputError("The file exceeds the upload limit.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TransferInputError("Empty upload.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new TransferInputError("The file exceeds the upload limit.", 413); }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
    catch { throw new TransferInputError("The file isn't valid UTF-8."); }
  } finally { reader.releaseLock(); }
}

export const transferJson = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...headers },
});

export function transferFailure(error: unknown) {
  if (error instanceof WorkLimitedError) return transferJson({ error: "rate_limited", message: error.message, retryAfter: error.retryAfter }, 429, { "Retry-After": String(error.retryAfter) });
  if (error instanceof TransferInputError) return transferJson({ error: "invalid_upload", message: error.message }, error.status);
  // Never return SQL errors, file contents or connection details to the browser.
  return transferJson({ error: "upload_failed", message: "Could not confirm the result. Retry with the same details." }, 500);
}
