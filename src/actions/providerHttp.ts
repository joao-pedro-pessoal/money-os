// Internal bounded HTTP reader. Callers choose fixed provider origins, never a client URL.
export async function providerJson(url: string | URL): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) {
    await response.body?.cancel();
    throw new Error("Provider unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 64 * 1024) throw new Error("Provider response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    try { await reader.cancel(); } catch { /* already aborted/closed */ }
    reader.releaseLock();
  }
}
