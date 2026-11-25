"use server";
import { requireServerSession } from "./requestSession";
import { pageAlerts, type AlertsRead } from "./alertData";
import { withWork, WorkLimitedError } from "./workGate";

/** Public RPC and Android API share one per-person request budget. */
export async function getAlerts(): Promise<AlertsRead> {
  await requireServerSession();
  try { return await withWork("alerts", pageAlerts); }
  catch (error) {
    if (error instanceof WorkLimitedError) return { alerts: [], currency: "", retryAfter: error.retryAfter };
    throw error;
  }
}
