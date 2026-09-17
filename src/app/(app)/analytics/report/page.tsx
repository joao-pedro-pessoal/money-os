import { getSpendingAnalysis } from "@/actions/spending";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { listBudgets } from "@/actions/budgets";
import PageTabs from "@/components/PageTabs";
import ResponsiveTable from "@/components/ResponsiveTable";
import ReportActions from "@/components/ReportActions";
import FilterSelect from "@/components/FilterSelect";
import { Money } from "@/components/PrivacyContext";
import { ANALYTICS_TABS } from "@/lib/navigation";
import { buildMonthlyReport, monthLabel, monthOf, reportMonths, reportToCsv } from "@/lib/reports/monthly";
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

/**
 * The monthly report: one month read back as a whole — what came in, what went
 * out and where, against the month before and the budgets, and what it did to
 * net worth. Downloadable as CSV and printable as PDF.
 */
export default async function MonthlyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ month: requested }, spending, netWorthSeries] = await Promise.all([
    searchParams,
    getSpendingAnalysis(),
    getTotalNetWorthOverTime(),
  ]);

  const currentMonth = monthOf(new Date());
  const available = reportMonths(spending.rows);
  if (!available.includes(currentMonth)) available.unshift(currentMonth);
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : currentMonth;

  // Budgets are periods counted from today; a month back is offset -1.
  const [cy, cm] = currentMonth.split("-").map(Number);
  const [sy, sm] = month.split("-").map(Number);
  const offset = (sy - cy) * 12 + (sm - cm);
  const budgets = await listBudgets(offset);

  const report = buildMonthlyReport({
    rows: spending.rows,
    month,
    netWorthSeries,
    budgets: budgets.items
      .filter((b) => b.period === "monthly")
      .map((b) => ({ name: b.name, limit: b.limit, spent: b.spent, percent: b.percent, status: b.status })),
  });
  const base = spending.baseCurrency;
  const csv = reportToCsv(report, base);
  const hasAnything = report.totals.transactions > 0;

  return (
    <div className="monthly-report space-y-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <PageTabs tabs={ANALYTICS_TABS} />

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Monthly report · {report.label}</h2>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
            {month === currentMonth
              ? "This month so far — the figures change until it closes."
              : "A closed month, as recorded."}{" "}
            Transfers between your own accounts and money moved into investments are not spending.
          </p>
        </div>
        <div className="report-actions flex gap-2 flex-wrap items-center">
          <FilterSelect
            label="Month"
            value={month}
            className="input"
            options={available.map((m) => ({ value: m, label: monthLabel(m), href: `/analytics/report?month=${m}` }))}
          />
          <ReportActions csv={csv} filename={`money-os-report-${month}.csv`} />
        </div>
      </div>

      {(spending.approximate || spending.unconverted.length > 0) && (
        <p className="text-xs text-[var(--muted)]">
          {spending.approximate && "Amounts in other currencies use today's rates, so earlier months are approximate. "}
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
                vs {report.previous?.label ?? "month before"}{" "}
                {report.previous ? <Change now={report.totals.income} before={report.previous.totals.income} /> : "—"}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)]">Spent</div>
              <div className="text-xl font-semibold mt-1 text-[var(--red)]"><Money value={report.totals.spent} currency={base} /></div>
              <div className="text-[11px] text-[var(--muted)] mt-1">
                vs month before{" "}
                {report.previous ? <Change now={report.totals.spent} before={report.previous.totals.spent} lowerIsBetter /> : "—"}
              </div>
              {report.averageSpent && (
                <div className="text-[11px] text-[var(--muted)]">
                  average of {report.averageSpent.months} earlier{" "}
                  {report.averageSpent.months === 1 ? "month" : "months"}{" "}
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
                {report.savingsRate === null ? "no income recorded this month" : "of income kept"}
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
                    Includes what markets did, so it can differ from the month&apos;s net.
                  </p>
                </>
              ) : (
                <p className="text-xs text-[var(--muted)] mt-2">No net worth snapshot inside this month.</p>
              )}
            </div>
            <div className="card p-4">
              <div className="text-sm font-medium">Fixed and variable</div>
              {report.split.fixedShare === null ? (
                <p className="text-xs text-[var(--muted)] mt-2">No spending this month.</p>
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
                      <th className="text-right">Month before</th>
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
              <div className="text-sm font-medium mb-3">Monthly budgets</div>
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
