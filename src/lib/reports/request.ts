import { REPORT_KINDS, isDay, isPeriodKey, periodOf, shiftDay, type ReportKind } from "./periods";
import { customKey, parseCustomKey, reportWindow } from "./monthly";

/** The address parameters a report reads. */
export interface ReportParams {
  period?: string;
  at?: string;
  /** The address the monthly report had before it had siblings. */
  month?: string;
  from?: string;
  to?: string;
  scope?: string;
}

/**
 * Which days the address asks for.
 *
 * A period still to come has no report, so one typed into the address opens
 * the current one; a custom range is cut at today for the same reason, and a
 * range with no valid days falls back to the last thirty days.
 */
export function resolveReportPeriod(params: ReportParams, today: string): { kind: ReportKind; key: string; current: string | null } {
  const kind: ReportKind = REPORT_KINDS.some((k) => k.value === params.period)
    ? (params.period as ReportKind)
    : "month";

  if (kind === "custom") {
    const to = params.to && isDay(params.to) && params.to <= today ? params.to : today;
    const from = params.from && isDay(params.from) && params.from <= to ? params.from : shiftDay(to, -29);
    const key = customKey(from, to);
    return { kind, key: parseCustomKey(key) ? key : customKey(shiftDay(today, -29), today), current: null };
  }

  const current = periodOf(kind, today);
  const requested = params.at ?? (kind === "month" ? params.month : undefined);
  const key = requested && isPeriodKey(kind, requested) && requested <= current ? requested : current;
  return { kind, key, current };
}

export class ReportLimitError extends Error {
  constructor(public readonly reason: "invalid" | "range" | "rows") { super(`PDF request rejected: ${reason}`); }
}

/** Strict PDF boundary; the page's tolerant defaults remain unchanged. */
export function pdfRequest(query: URLSearchParams, today: string, maxDays: number): ReportParams {
  const allowed = new Set(["period", "at", "month", "from", "to", "scope"]);
  const params: Record<string, string> = {};
  for (const [key, value] of query) {
    if (!allowed.has(key) || key in params || value.length > 40) throw new ReportLimitError("invalid");
    params[key] = value;
  }
  if (params.period !== undefined && !REPORT_KINDS.some(kind => kind.value === params.period)) throw new ReportLimitError("invalid");
  const kind = (params.period ?? "month") as ReportKind;
  if (params.scope !== undefined && !["money", "investments", "both"].includes(params.scope)) throw new ReportLimitError("invalid");
  if (params.month !== undefined && !isPeriodKey("month", params.month)) throw new ReportLimitError("invalid");
  if (params.at !== undefined && (kind === "custom" || !isPeriodKey(kind, params.at))) throw new ReportLimitError("invalid");
  if ([params.from, params.to].some(day => day !== undefined && !isDay(day))) throw new ReportLimitError("invalid");
  if (params.from && params.to && params.from > params.to) throw new ReportLimitError("invalid");
  const period = resolveReportPeriod(params, today);
  const window = reportWindow(period.kind, period.key);
  const length = (Date.parse(window.to) - Date.parse(window.from)) / 86400_000 + 1;
  if (!Number.isFinite(length) || length > maxDays) throw new ReportLimitError("range");
  return params;
}
