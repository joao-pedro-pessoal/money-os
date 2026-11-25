import { readFailure, readJson } from "@/actions/readHttp";
import { WorkLimitedError } from "@/actions/workGate";
import { getAlerts } from "@/actions/alerts";
import { textForRequest } from "@/actions/pageLanguage";
import { shouldNotify } from "@/lib/alerts/rules";
import { hasSession } from "@/actions/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The alerts worth a phone notification, for the Android app.
 *
 * The same list the bell shows (`getAlerts`), narrowed by `shouldNotify`, and
 * behind the session cookie like every page (see src/proxy.ts). The app asks
 * from time to time and notifies each id once; an alert that goes away and
 * comes back is news again. Deciding stays here, so the phone never has a rule
 * of its own about what is worth saying.
 */
export async function GET() {
  if (!(await hasSession())) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await getAlerts();
    if (result.retryAfter) return readFailure(new WorkLimitedError(result.retryAfter));
    if (result.unavailable) return readFailure(new Error("Alerts unavailable"));
    const uiText = await textForRequest();
    const { alerts } = result;
    return readJson(
      {
        checkedAt: result.checkedAt ?? new Date().toISOString(),
        alerts: alerts.filter(shouldNotify).map((a) => ({
          id: a.id,
          severity: a.severity,
          title: uiText(a.title),
          detail: a.detail ? uiText(a.detail) : null,
          href: a.href,
        })),
      },
      200
    );
  } catch (error) { return readFailure(error); }
}
