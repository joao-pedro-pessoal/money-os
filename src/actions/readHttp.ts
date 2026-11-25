import { currentLanguage } from "./language";
import { WorkLimitedError } from "./workGate";
import { SessionRequiredError } from "./requestSession";
import { readText } from "@/lib/accounts/readText";

export const readJson = (body: unknown, status: number, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", ...extra } });
export async function readFailure(error: unknown, kind: "alerts" | "widget" | "pdf" = "alerts") {
  const text = readText(await currentLanguage());
  if (error instanceof WorkLimitedError) return readJson({ error: "rate_limited", message: text.limited(error.retryAfter), retryAfter: error.retryAfter }, 429, { "Retry-After": String(error.retryAfter) });
  if (error instanceof SessionRequiredError) return readJson({ error: "session_required", message: text.session }, 401);
  return readJson({ error: "unavailable", message: kind === "pdf" ? text.pdfFailed : kind === "widget" ? text.dataUnavailable : text.unavailable }, 503);
}
