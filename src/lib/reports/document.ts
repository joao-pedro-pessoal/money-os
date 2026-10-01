/**
 * One report, three ways out: the page, the CSV and the PDF.
 *
 * What each of them is called and what goes into the file are decided here,
 * once, from the same two report objects — the money side (`monthly.ts`) and
 * the investing side (`investments.ts`). That is what makes "the same period
 * gives the same totals on screen, in the CSV and in the PDF" true by
 * construction rather than by care.
 *
 * Pure.
 */
import { investmentCsvLines, type InvestmentReport } from "./investments";
import { csvHeader, csvText, moneyCsvLines, type PeriodReport } from "./monthly";
import type { ReportKind } from "./periods";

/** Which money a report is about: the everyday kind, the invested kind, or both. */
export type ReportScope = "both" | "money" | "investments";

export const REPORT_SCOPES: { value: ReportScope; label: string }[] = [
  { value: "both", label: "Money and investments" },
  { value: "money", label: "Money only" },
  { value: "investments", label: "Investments only" },
];

export function isReportScope(value: string | undefined): value is ReportScope {
  return REPORT_SCOPES.some((s) => s.value === value);
}

export const REPORT_TITLE: Record<ReportKind, string> = {
  week: "Weekly report",
  month: "Monthly report",
  year: "Annual report",
  custom: "Report",
};

export interface ReportContents {
  kind: ReportKind;
  key: string;
  label: string;
  from: string;
  to: string;
  currency: string;
  scope: ReportScope;
  /** Null when the scope leaves the day-to-day money out. */
  money: PeriodReport | null;
  /** Null when the scope leaves investments out. */
  investments: InvestmentReport | null;
}

/** The whole report as CSV: a header, then each part asked for, one section after another. */
export function reportCsv(report: ReportContents): string {
  const lines = csvHeader(report.kind, report.label, report, report.currency);
  if (report.money !== null) lines.push([], ...moneyCsvLines(report.money));
  if (report.investments !== null) lines.push([], ...investmentCsvLines(report.investments));
  return csvText(lines);
}

/** "money-os-report-2026-09.pdf", "money-os-investments-2026-03-01_2026-04-17.csv". */
export function reportFileName(report: Pick<ReportContents, "key" | "scope">, extension: "csv" | "pdf"): string {
  const part = report.scope === "both" ? "report" : report.scope === "money" ? "money" : "investments";
  return `money-os-${part}-${report.key.replace("..", "_")}.${extension}`;
}
