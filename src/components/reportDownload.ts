import { readText } from "@/lib/accounts/readText";

/** Stable client feedback, including hosts that return a non-JSON error page. */
export async function reportDownload(url: string, language: string): Promise<Blob> {
  const text = readText(language);
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", credentials: "same-origin" }); }
  catch { throw new Error(text.pdfFailed); }
  if (response.status === 401 || response.redirected) throw new Error(text.session);
  if (response.status === 429) throw new Error(text.limited(Math.max(1, Number(response.headers.get("retry-after")) || 60)));
  if (response.status === 400) throw new Error(text.invalid);
  if (response.status === 413) {
    let reason = "";
    try { reason = (await response.json()).error; } catch { /* host rejection */ }
    throw new Error(reason === "pdf_range" ? text.pdfRange : text.pdfRows);
  }
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error(text.pdfFailed);
  return response.blob();
}
