import { transferText } from "@/lib/backup/text";

export async function transferRequest(url: string, body: string, language: string, extraHeaders: Record<string, string> = {}) {
  const text = transferText(language);
  let response: Response;
  try { response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...extraHeaders }, body }); }
  catch { throw new Error(text.failed); }
  if (response.status === 401 || response.redirected) throw new Error(text.session);
  if (response.status === 429) throw new Error(text.retryAfter(Number(response.headers.get("retry-after")) || 60));
  if (response.status === 413) throw new Error(text.tooLarge);
  if (response.status >= 500) throw new Error(text.failed);
  let value;
  try { value = await response.json(); } catch { throw new Error(text.failed); }
  // Inspection returns its bounded validation report even for a rejected file.
  if (!response.ok && !(Array.isArray(value.errors) && value.ok === false)) throw new Error(typeof value.message === "string" ? text.validation(value.message) : text.failed);
  return value;
}
