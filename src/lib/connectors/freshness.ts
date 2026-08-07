/**
 * Data freshness (PRODUCT_VISION §12): automatic data must always show its
 * age. Stale data is never presented as if it were live.
 */

export type Freshness = "LIVE" | "FRESH" | "STALE" | "ERROR" | "NEVER";

export interface FreshnessInput {
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
}

/**
 * LIVE  — synced within the last 5 minutes
 * FRESH — within the last hour
 * STALE — older than that
 * ERROR — the last attempt failed (takes priority: a stale-but-erroring
 *         connection is a problem, not just old data)
 * NEVER — never synced
 */
export function freshnessOf(
  input: FreshnessInput,
  now: Date = new Date(),
  liveMinutes = 5,
  freshMinutes = 60
): Freshness {
  if (input.lastSyncStatus === "error") return "ERROR";
  if (!input.lastSyncAt) return "NEVER";

  const ageMinutes = (now.getTime() - input.lastSyncAt.getTime()) / 60000;
  if (ageMinutes <= liveMinutes) return "LIVE";
  if (ageMinutes <= freshMinutes) return "FRESH";
  return "STALE";
}

export function freshnessLabel(f: Freshness): string {
  switch (f) {
    case "LIVE":
      return "Live";
    case "FRESH":
      return "Fresh";
    case "STALE":
      return "Stale";
    case "ERROR":
      return "Error";
    case "NEVER":
      return "Never synced";
  }
}

export function freshnessColor(f: Freshness): string {
  switch (f) {
    case "LIVE":
      return "var(--green)";
    case "FRESH":
      return "var(--accent)";
    case "STALE":
      return "var(--amber)";
    case "ERROR":
      return "var(--red)";
    case "NEVER":
      return "var(--muted)";
  }
}
