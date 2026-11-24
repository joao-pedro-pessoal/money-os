// Route Handlers do not inherit Server Actions' CSRF/body safeguards.
export async function authBody(request: Request, origin: string, form = false, native = false): Promise<unknown> {
  const supplied = request.headers.get("origin");
  // Native POST navigation may have no initiator or an opaque Origin. Its
  // browser cookie AND independent native verifier are checked by the protocol.
  const nativeOrigin = native && (supplied === null || supplied === "null");
  if ((!nativeOrigin && supplied !== origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Invalid origin");
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== (form ? "application/x-www-form-urlencoded" : "application/json")) throw new Error("Invalid content type");
  const reader = request.body?.getReader();
  if (!reader || Number(request.headers.get("content-length")) > 16384) throw new Error("Invalid body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return form ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
  } finally { reader.releaseLock(); }
}

export const authJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
