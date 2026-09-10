export type DashboardWindowState = "visible" | "minimized" | "hidden";

export const DASHBOARD_WINDOWS = [
  { id: "portfolio-returns", label: "Time and money weighted return", defaultState: "minimized" },
  { id: "gain-attribution", label: "Where the gains came from", defaultState: "minimized" },
  { id: "contributions", label: "Money added versus money made", defaultState: "minimized" },
] as const;

export type DashboardWindowId = (typeof DASHBOARD_WINDOWS)[number]["id"];
export type DashboardWindowPreferences = Record<DashboardWindowId, DashboardWindowState>;

export const DEFAULT_DASHBOARD_WINDOW_PREFERENCES: DashboardWindowPreferences = Object.fromEntries(
  DASHBOARD_WINDOWS.map((w) => [w.id, w.defaultState])
) as DashboardWindowPreferences;

export function normalizeDashboardWindowPreferences(value: unknown): DashboardWindowPreferences {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    DASHBOARD_WINDOWS.map((w) => {
      const state = input[w.id];
      return [w.id, state === "visible" || state === "minimized" || state === "hidden" ? state : w.defaultState];
    })
  ) as DashboardWindowPreferences;
}
