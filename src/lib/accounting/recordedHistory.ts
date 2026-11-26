import { periodReturns, type SeriesPoint } from "@/lib/stats";

/** Snapshot history does not contain the past balances of separate debts. */
export const RECORDED_VALUE_COPY = {
  title: "Recorded value",
  chart: "Recorded value through the period",
  start: "Recorded value at start",
  end: "Recorded value at end",
  change: "Recorded value change",
  note: "Account balances and holdings from recorded snapshots. Separate debts are not deducted, so this is not net worth.",
  empty: "No recorded value snapshot inside this period.",
  overTime: "Recorded value over time",
  changes: "Recorded value changes",
  changesNote: "Change in recorded account and holding values over each period. Includes money added or withdrawn and market movements; this is not an investment return.",
  falls: "Falls in recorded value",
  progress: "Understand your recorded savings and account values over time.",
  latestDate: "Latest recorded date: {0}.",
} as const;

/** Uses the same period-change arbiter as Statistics; never compares to live net worth. */
export function recordedHistory(points: SeriesPoint[]) {
  if (!points.length || points.some(point => !Number.isFinite(point.value))) return { basis: "recorded-assets" as const, latestValue: null, change: null, latestDate: null };
  const all = periodReturns(points).find(period => period.key === "all")!;
  const latestDate = points.reduce((latest, point) => point.date > latest ? point.date : latest, "");
  return { basis: "recorded-assets" as const, latestValue: all.to, change: points.length < 2 ? null : all.change, latestDate };
}
