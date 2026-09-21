import { getSpendingAnalysis } from "@/actions/spending";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { listBudgets } from "@/actions/budgets";
import PageTabs from "@/components/PageTabs";
import ResponsiveTable from "@/components/ResponsiveTable";
import ReportActions from "@/components/ReportActions";
import FilterSelect from "@/components/FilterSelect";
import { Money } from "@/components/PrivacyContext";
import { ANALYTICS_TABS } from "@/lib/navigation";
import { buildReport, reportPeriods, reportToCsv } from "@/lib/reports/monthly";
import {
  isPeriodKey,
  periodLabel,
  periodOf,
  periodsBetween,
  REPORT_PERIODS,
  type ReportPeriod,
} from "@/lib/reports/periods";
import { localDay } from "@/lib/calendar/localDay";
import FilterLink from "@/components/FilterLink";
import Link from "next/link";

const tone = (n: number) => (n > 0 ? "text-[var(--green)]" : n < 0 ? "text-[var(--red)]" : "");

/** "+12.5%" against something, or nothing when there is nothing to compare with. */
function Change({ now, before, lowerIsBetter = false }: { now: number; before: number | null; lowerIsBetter?: boolean }) {
  if (before === null || before === 0) return null;
  const percent = ((now - before) / before) * 100;
  const good = lowerIsBetter ? percent < 0 : percent > 0;
  return (
    <span className={percent === 0 ? "text-[var(--muted)]" : good ? "text-[var(--green)]" : "text-[var(--red)]"}>
      {percent > 0 ? "+" : ""}
      {percent.toFixed(1)}%
    </span>
  );
}

/** What a budget of each report's length is called in `envelopes.ts`. */
const BUDGET_PERIOD: Record<ReportPeriod, string> = { week: "weekly", month: "monthly", year: "yearly" };

const REPORT_TITLE: Record<ReportPeriod, string> = { week: "Weekly report", month: "Monthly report", year: "Annual report" };

/**
 * The weekly, monthly and annual report: one period read back as a whole —
 * what came in, what went out and where, against the period before and the
 * budgets of that length, and what it did to net worth. A year also shows each
 * month. Downloadable as CSV and printable as PDF.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; at?: string; month?: string }>;
}) {
  const [params, spending, netWorthSeries] = await Promise.all([
    searchParams,
    getSpendingAnalysis(),
    getTotalNetWorthOverTime(),
  ]);

  const kind: ReportPeriod = REPORT_PERIODS.some((p) => p.value === params.period)
    ? (params.period as ReportPeriod)
    : "month";
  // The period on the wall, not in UTC: see `localDay`.
  const current = periodOf(kind, localDay());
  // `?month=` is the address the monthly report had before it had siblings.
  const requested = params.at ?? (kind === "month" ? params.month : undefined);
  // A period still to come has no report; one typed into the address opens this one.
  const key = requested && isPeriodKey(kind, requested) && requested <= current ? requested : current;

  const available = reportPeriods(spending.rows, kind);
  if (!available.includes(current)) available.unshift(current);
  // An empty period from the address still has to be the one the picker shows.
  if (!available.includes(key)) {
    available.push(key);
    available.sort().reverse();
  }

  // Budgets are periods counted from today; one back is offset -1, whatever its length.
  const budgets = await listBudgets(periodsBetween(kind, current, key));

  const report = buildReport({
    kind,
    key,
    rows: spending.rows,
    netWorthSeries,
    budgets: budgets.items
      .filter((b) => b.period === BUDGET_PERIOD[kind])
      .map((b) => ({ name: b.name, limit: b.limit, spent: b.spent, percent: b.percent, status: b.status })),
  });
  const noun = kind;
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  const href = (period: ReportPeriod, at?: string) => `/analytics/report?period=${period}${at ? `&at=${at}` : ""}`;
  const base = spending.baseCurrency;
  const csv = reportToCsv(report, base);
  const hasAnything = report.totals.transactions > 0;

  return (
    <div className="monthly-report space-y-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <PageTabs tabs={ANALYTICS_TABS} />

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{REPORT_TITLE[kind]} · {report.label}</h2>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
            {key === current
              ? `This ${noun} so far — the figures change until it closes.`
              : `A closed ${noun}, as recorded.`}{" "}
            Transfers between your own accounts and money moved into investments are not spending.
          </p>
        </div>
        <div className="report-actions flex gap-2 flex-wrap items-center">
          <FilterSelect
            label="Report"
            value={kind}
            className="input"
            options={REPORT_PERIODS.map((p) => ({ value: p.value, label: p.label, href: href(p.value) }))}
          />
          <FilterSelect
            label={Noun}
            value={key}
            className="input"
            options={available.map((k) => ({ value: k, label: periodLabel(kind, k), href: href(kind, k) }))}
          />
          <ReportActions csv={csv} filename={`money-os-report-${key}.csv`} />
        </div>
      </div>

      {(spending.approximate || spending.unconverted.length > 0) && (
        <p className="text-xs text-[var(--muted)]">
          {spending.approximate && `Amounts in other currencies use today's rates, so earlier ${noun}s are approximate. `}
          {spending.unconverted.length > 0 &&
            `Left out, no exchange rate: ${spending.unconverted.join(", ")}.`}
        </p>
      )}

      {!hasAnything ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Nothing recorded in {report.label}.{" "}
          <Link href="/transactions" className="text-[var(--accent)]">Record a movement</Link> or{" "}
          <Link href="/import" className="text-[var(--accent)]">import a statement</Link>.
        </div>
      ) : (
        <>
          <div className="report-cards grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)]">Income</div>
              <div className="text-xl font-semibold mt-1 text-[var(--green)]"><Money value={report.totals.income} currency={base} /></div>
              <div className="text-[11px] text-[var(--muted)] mt-1">
                vs {report.previous?.label ?? `${noun} before`}{" "}
                {report.previous ? <Change now={report.totals.income} before={report.previous.totals.income} /> : "—"}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)]">Spent</div>
              <div className="text-xl font-semibold mt-1 text-[var(--red)]"><Money value={report.totals.spent} currency={base} /></div>
              <div className="text-[11px] text-[var(--muted)] mt-1">
                vs {noun} before{" "}
                {report.previous ? <Change now={report.totals.spent} before={report.previous.totals.spent} lowerIsBetter /> : "—"}
              </div>
              {report.averageSpent && (
                <div className="text-[11px] text-[var(--muted)]">
                  average of {report.averageSpent.periods} earlier{" "}
                  {report.averageSpent.periods === 1 ? noun : `${noun}s`}{" "}
                  <Money value={report.averageSpent.amount} currency={base} />
                </div>
              )}
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)]">Net</div>
              <div className={`text-xl font-semibold mt-1 ${tone(report.totals.net)}`}><Money value={report.totals.net} currency={base} /></div>
              {report.invested > 0 && (
                <div className="text-[11px] text-[var(--muted)] mt-1">
                  <Money value={report.invested} currency={base} /> moved into investments
                </div>
              )}
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)]">Savings rate</div>
              <div className={`text-xl font-semibold mt-1 ${report.savingsRate === null ? "" : tone(report.savingsRate)}`}>
                {report.savingsRate === null ? "—" : `${report.savingsRate.toFixed(1)}%`}
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-1">
                {report.savingsRate === null ? `no income recorded this ${noun}` : "of income kept"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="text-sm font-medium">Net worth</div>
              {report.netWorth ? (
                <>
                  <div className={`text-xl font-semibold mt-2 ${tone(report.netWorth.change)}`}>
                    {report.netWorth.change > 0 ? "+" : ""}
                    <Money value={report.netWorth.change} currency={base} />
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    <Money value={report.netWorth.start} currency={base} /> →{" "}
                    <Money value={report.netWorth.end} currency={base} />
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-2">
                    Includes what markets did, so it can differ from the {noun}&apos;s net.
                  </p>
                </>
              ) : (
                <p className="text-xs text-[var(--muted)] mt-2">No net worth snapshot inside this {noun}.</p>
              )}
            </div>
            <div className="card p-4">
              <div className="text-sm font-medium">Fixed and variable</div>
              {report.split.fixedShare === null ? (
                <p className="text-xs text-[var(--muted)] mt-2">No spending this {noun}.</p>
              ) : (
                <>
                  <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden flex mt-3" aria-hidden="true">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${report.split.fixedShare}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-2 gap-3 flex-wrap">
                    <span>Fixed <Money value={report.split.fixed} currency={base} /> ({report.split.fixedShare.toFixed(0)}%)</span>
                    <span>Variable <Money value={report.split.variable} currency={base} /></span>
                  </div>
                  <p className="text-[11px] text-[var(--muted)] mt-2">
                    Variable is what a decision could still have moved.
                  </p>
                </>
              )}
            </div>
          </div>

          {report.months && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-3">Month by month</div>
              <div className="table-scroll" role="region" aria-label="Month by month" tabIndex={0}>
                <ResponsiveTable className="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="text-right">Income</th>
                      <th className="text-right">Spent</th>
                      <th className="text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((m) => (
                      <tr key={m.key}>
                        <td>
                          <FilterLink href={href("month", m.key)} className="hover:underline">{m.label}</FilterLink>
                        </td>
                        {m.totals === null ? (
                          // Nothing recorded is not a month of nothing spent.
                          <td className="text-right text-[var(--muted)]" colSpan={3}>nothing recorded</td>
                        ) : (
                          <>
                            <td className="text-right text-[var(--green)]"><Money value={m.totals.income} currency={base} /></td>
                            <td className="text-right text-[var(--red)]"><Money value={m.totals.spent} currency={base} /></td>
                            <td className={`text-right ${tone(m.totals.net)}`}><Money value={m.totals.net} currency={base} /></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            </div>
          )}

          {report.categories.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-3">Where it went</div>
              <div className="table-scroll" role="region" aria-label="Spending by category" tabIndex={0}>
                <ResponsiveTable className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="text-right">Spent</th>
                      <th className="text-right">Share</th>
                      <th className="text-right">{Noun} before</th>
                      <th className="text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((c) => (
                      <tr key={c.name}>
                        <td>
                          {c.name}
                          <div className="text-[10px] text-[var(--muted)]">{c.count} {c.count === 1 ? "payment" : "payments"}</div>
                        </td>
                        <td className="text-right"><Money value={c.spent} currency={base} /></td>
                        <td className="text-right">{c.share.toFixed(1)}%</td>
                        <td className="text-right text-[var(--muted)]">
                          {c.previous > 0 ? <Money value={c.previous} currency={base} /> : "—"}
                        </td>
                        <td className="text-right">
                          {c.changePercent === null ? (
                            <span className="text-[var(--muted)]">new</span>
                          ) : (
                            <span className={c.changePercent > 0 ? "text-[var(--red)]" : c.changePercent < 0 ? "text-[var(--green)]" : ""}>
                              {c.changePercent > 0 ? "+" : ""}
                              {c.changePercent.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
              {report.totals.uncategorised > 0 && (
                <p className="text-[11px] text-[var(--muted)] mt-2">
                  <Money value={report.totals.uncategorised} currency={base} /> has no category —{" "}
                  <Link href="/transactions" className="text-[var(--accent)]">file it</Link> and this breakdown gets sharper.
                </p>
              )}
            </div>
          )}

          {report.budgets.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-3">{kind === "week" ? "Weekly" : kind === "month" ? "Monthly" : "Yearly"} budgets</div>
              <div className="space-y-3">
                {report.budgets.map((b) => (
                  <div key={b.name}>
                    <div className="flex justify-between text-xs gap-3">
                      <span>{b.name}</span>
                      <span className={b.status === "over" ? "text-[var(--red)]" : "text-[var(--muted)]"}>
                        <Money value={b.spent} currency={base} /> of <Money value={b.limit} currency={base} /> · {b.percent}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden mt-1" aria-hidden="true">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.min(100, b.percent)}%`,
                          background: b.status === "over" ? "var(--red)" : b.status === "close" ? "var(--amber)" : "var(--green)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.topExpenses.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-3">Largest expenses</div>
              <div className="table-scroll" role="region" aria-label="Largest expenses" tabIndex={0}>
                <ResponsiveTable className="data-table">
                  <thead>
                    <tr>
                      <th>What</th>
                      <th>Date</th>
                      <th>Account</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topExpenses.map((e, i) => (
                      <tr key={`${e.date}-${i}`}>
                        <td>
                          {e.name}
                          {e.category && e.category !== e.name && (
                            <div className="text-[10px] text-[var(--muted)]">{e.category}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap">{e.date}</td>
                        <td className="text-[var(--muted)]">{e.account}</td>
                        <td className="text-right"><Money value={e.amount} currency={base} /></td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
