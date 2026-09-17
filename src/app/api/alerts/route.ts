import { NextResponse } from "next/server";
import { getAlerts } from "@/actions/alerts";
import { shouldNotify } from "@/lib/alerts/rules";

export const dynamic = "force-dynamic";

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
  const { alerts } = await getAlerts();
  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      alerts: alerts.filter(shouldNotify).map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        detail: a.detail ?? null,
        href: a.href,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
