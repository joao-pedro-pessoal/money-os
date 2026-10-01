/**
 * Everything a report needs, read once, for the page and for its PDF.
 *
 * The page and the file download call this with the same address parameters
 * and get the same objects back, so the figures on screen, in the CSV and in
 * the PDF are one computation shown three ways.
 *
 * Not a server action: nothing in the browser calls it. The report page and
 * the PDF route import it directly, which is why there is no "use server" here.
 */
import { db } from "@/db/client";
import { benchmarkPrices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSpendingAnalysis } from "./spending";
import { getTotalNetWorthOverTime } from "./analytics";
import { listBudgets } from "./budgets";
import { getPortfolioReturns } from "./investments";
import { getTradeAnalysis } from "./investmentActivity";
import { getIncomePayments } from "./dividends";
import { getPortfolioItems } from "./dashboard";
import { getBenchmarkChoice } from "./benchmark";
import { getBaseCurrency } from "./settings";
import { localDay } from "@/lib/calendar/localDay";
import { portfolioSummary } from "@/lib/portfolio/positionView";
import { buildInvestmentReport, type InvestmentReport } from "@/lib/reports/investments";
import { buildReport, customKey, parseCustomKey, reportPeriods, reportWindow, type PeriodReport } from "@/lib/reports/monthly";
import {
  isDay,
  isPeriodKey,
  periodOf,
  periodsBetween,
  REPORT_KINDS,
  shiftDay,
  type ReportKind,
  type ReportPeriod,
} from "@/lib/reports/periods";
import { isReportScope, type ReportContents, type ReportScope } from "@/lib/reports/document";

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

/** What a budget of each report's length is called in `envelopes.ts`. */
const BUDGET_PERIOD: Record<ReportPeriod, string> = { week: "weekly", month: "monthly", year: "yearly" };

export interface LoadedReport extends ReportContents {
  /** The period today is in, or null for a custom range. */
  current: string | null;
  /** The periods the picker offers, newest first; empty for a custom range. */
  available: string[];
  /** Today, on the wall. */
  today: string;
  /** Said once above the figures: approximate rates, and anything left out. */
  notes: string[];
}

/**
 * Which days the address asks for.
 *
 * A period still to come has no report, so one typed into the address opens
 * the current one; a custom range is cut at today for the same reason, and a
 * range with no valid days falls back to the last thirty days.
 */
function resolvePeriod(params: ReportParams, today: string): { kind: ReportKind; key: string; current: string | null } {
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

export async function loadReport(params: ReportParams): Promise<LoadedReport> {
  // The period on the wall, not in UTC: see `localDay`.
  const today = localDay();
  const { kind, key, current } = resolvePeriod(params, today);
  const scope: ReportScope = isReportScope(params.scope) ? params.scope : "both";
  const wantsMoney = scope !== "investments";
  const wantsInvestments = scope !== "money";

  const [spending, base] = await Promise.all([getSpendingAnalysis(), getBaseCurrency()]);

  const available = kind === "custom" ? [] : reportPeriods(spending.rows, kind);
  if (current !== null && !available.includes(current)) available.unshift(current);
  // An empty period from the address still has to be the one the picker shows.
  if (kind !== "custom" && !available.includes(key)) {
    available.push(key);
    available.sort().reverse();
  }

  const [money, investments] = await Promise.all([
    wantsMoney ? loadMoney(kind, key, current, spending.rows) : null,
    wantsInvestments ? loadInvestments(kind, key, today) : null,
  ]);

  // Any report is the same days, whichever parts it holds.
  const window = money ?? reportWindow(kind, key);
  const noun = kind === "custom" ? "period" : kind;
  const notes: string[] = [];
  if (wantsMoney && spending.approximate) {
    notes.push(`Amounts in other currencies use today's rates, so an earlier ${noun} is approximate.`);
  }
  if (wantsMoney && spending.unconverted.length > 0) {
    notes.push(`Left out, no exchange rate: ${spending.unconverted.join(", ")}.`);
  }
  if (investments !== null && investments.unconverted > 0) {
    notes.push(
      `${investments.unconverted} investment ${investments.unconverted === 1 ? "figure is" : "figures are"} in a currency with no rate yet, and left out.`
    );
  }

  return {
    kind,
    key,
    label: window.label,
    from: window.from,
    to: window.to,
    currency: base,
    scope,
    money,
    investments: investments?.report ?? null,
    current,
    available,
    today,
    notes,
  };
}

async function loadMoney(
  kind: ReportKind,
  key: string,
  current: string | null,
  rows: Awaited<ReturnType<typeof getSpendingAnalysis>>["rows"]
): Promise<PeriodReport> {
  const [netWorthSeries, budgets] = await Promise.all([
    getTotalNetWorthOverTime(),
    // Budgets are kept per week, month and year; a range of days you chose has none of its own.
    kind === "custom" || current === null
      ? null
      : // Budgets are periods counted from today; one back is offset -1, whatever its length.
        listBudgets(periodsBetween(kind, current, key)),
  ]);
  return buildReport({
    kind,
    key,
    rows,
    netWorthSeries,
    budgets:
      kind === "custom" || budgets === null
        ? []
        : budgets.items
            .filter((b) => b.period === BUDGET_PERIOD[kind])
            .map((b) => ({ name: b.name, limit: b.limit, spent: b.spent, percent: b.percent, status: b.status })),
  });
}

async function loadInvestments(
  kind: ReportKind,
  key: string,
  today: string
): Promise<{ report: InvestmentReport; unconverted: number }> {
  const { from, to } = reportWindow(kind, key);

  const [returns, trades, income, items, benchmark] = await Promise.all([
    getPortfolioReturns(),
    getTradeAnalysis(),
    getIncomePayments(),
    // What is held is known for today only; a period that ended earlier does not read it.
    to >= today ? getPortfolioItems() : null,
    getBenchmarkChoice(),
  ]);
  const closes = await db.select().from(benchmarkPrices).where(eq(benchmarkPrices.symbol, benchmark.symbol));
  const summary = items === null ? null : portfolioSummary(items.items);

  return {
    report: buildInvestmentReport({
      from,
      to,
      today,
      values: returns.valuePoints,
      flows: returns.flows,
      moneyWeightedWithheld: returns.withheld.moneyWeighted,
      trades: trades.rows,
      income: income.payments,
      benchmark: {
        name: benchmark.name,
        currency: closes[0]?.currency ?? null,
        expectedCurrency: benchmark.currency,
        points: closes.map((r) => ({ date: r.date, close: Number(r.close) })),
      },
      holdings:
        items === null || summary === null
          ? null
          : {
              held: summary.held,
              unrealised: summary.pnl,
              costUnknown: summary.costUnknown,
              items: items.items.map((i) => ({
                name: i.listing ?? i.symbol,
                account: i.accountName,
                assetType: i.assetType,
                value: i.value,
                pnl: i.costUnknown ? null : i.pnl,
              })),
            },
    }),
    unconverted: income.unconverted + trades.unconvertible,
  };
}
