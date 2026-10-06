import { loadReport } from "@/actions/reports";
import PageTabs from "@/components/PageTabs";
import ResponsiveTable from "@/components/ResponsiveTable";
import ReportActions from "@/components/ReportActions";
import ReportChart from "@/components/ReportChart";
import InvestmentReportSection from "@/components/InvestmentReport";
import RangePicker from "@/components/RangePicker";
import FilterSelect from "@/components/FilterSelect";
import { Money } from "@/components/PrivacyContext";
import { ANALYTICS_TABS } from "@/lib/navigation";
import { periodNoun } from "@/lib/reports/monthly";
import { monthTick, periodLabel, REPORT_KINDS, spansYears, type ReportKind } from "@/lib/reports/periods";
import { REPORT_SCOPES, REPORT_TITLE, reportCsv, reportFileName, type ReportScope } from "@/lib/reports/document";
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

/**
 * The report: a week, a month, a year or any range of days, read back as a
 * whole — the day-to-day money (what came in, what went out and where, against
 * the period before and the budgets of that length, and what it did to net
 * worth), the investments (value, money in and out, trades, dividends, return
 * against an index, what is held), or both. Downloadable as CSV and as a PDF
 * the app draws, with the same figures as the page: all three read
 * `loadReport`.
 */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; at?: string; month?: string; from?: string; to?: string; scope?: string }>;
}) {
  const loaded = await loadReport(await searchParams);
  const { kind, key, current, scope } = loaded;
  const report = loaded.money;

  const noun = periodNoun(kind);
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  /** The report's address with some of its choices changed, keeping the rest. */
  const href = (changes: { period?: ReportKind; at?: string; scope?: ReportScope; from?: string; to?: string }) => {
    const period = changes.period ?? kind;
    const query = new URLSearchParams({ period });
    if (period === "custom") {
      query.set("from", changes.from ?? loaded.from);
      query.set("to", changes.to ?? loaded.to);
    } else if (changes.at) {
      query.set("at", changes.at);
    } else if (changes.period === undefined) {
      query.set("at", key);
    }
    const chosenScope = changes.scope ?? scope;
    if (chosenScope !== "both") query.set("scope", chosenScope);
    return `/analytics/report?${query.toString()}`;
  };
  const base = loaded.currency;
  const csv = reportCsv(loaded);
  const pdfHref = `/api/report/pdf?${href({}).split("?")[1]}`;
  const hasAnything = (report?.totals.transactions ?? 0) > 0;

  return (
    <div className="monthly-report space-y-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <PageTabs tabs={ANALYTICS_TABS} />

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{REPORT_TITLE[kind]} · {loaded.label}</h2>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
            {kind === "custom"
              ? loaded.to === loaded.today
                ? "Up to today — the figures change until the day closes."
                : "A range of days, as recorded."
              : key === current
                ? `This ${noun} so far — the figures change until it closes.`
                : `A closed ${noun}, as recorded.`}{" "}
            {scope !== "investments" &&
              "Transfers between your own accounts and money moved into investments are not spending."}
          </p>
        </div>
        {/* One row of equal choices on a wide screen, one under another on a phone. */}
        <div className="report-actions grid gap-2 w-full sm:grid-flow-col sm:auto-cols-fr">
          <FilterSelect
            label="Report"
            value={kind}
            className="input"
            options={REPORT_KINDS.map((p) => ({ value: p.value, label: p.label, href: href({ period: p.value }) }))}
          />
          {kind !== "custom" && (
            <FilterSelect
              label={Noun}
              value={key}
              className="input"
              options={loaded.available.map((k) => ({ value: k, label: periodLabel(kind, k), href: href({ at: k }) }))}
            />
          )}
          <FilterSelect
            label="What the report covers"
            value={scope}
            className="input"
            options={REPORT_SCOPES.map((s) => ({ value: s.value, label: s.label, href: href({ scope: s.value }) }))}
          />
        </div>
      </div>

      {kind === "custom" && (
        <RangePicker
          from={loaded.from}
          to={loaded.to}
          max={loaded.today}
          path={`/analytics/report?${new URLSearchParams(scope === "both" ? { period: "custom" } : { period: "custom", scope })}`}
        />
      )}

      <ReportActions
        csv={csv}
        filename={reportFileName(loaded, "csv")}
        pdfHref={pdfHref}
        pdfFilename={reportFileName(loaded, "pdf")}
      />

      {loaded.notes.length > 0 && (
        <p className="text-xs text-[var(--muted)]">{loaded.notes.join(" ")}</p>
      )}

      {report !== null && loaded.investments !== null && (
        <h3 className="text-base font-semibold">Day-to-day money</h3>
      )}

      {report === null ? null : !hasAnything ? (
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

          {report.netWorthLine.length >= 2 && (
            <div className="card p-4">
              <ReportChart
                kind="line"
                title="Net worth through the period"
                series={[{ name: "Net worth", color: "accent", points: report.netWorthLine }]}
                range={{ from: report.from, to: report.to }}
                unit={base}
              />
            </div>
          )}

          {report.months && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-3">Month by month</div>
              <div className="mb-4">
                <ReportChart
                  kind="columns"
                  title="Income and spending"
                  groups={report.months.map((m) => ({
                    label: monthTick(m.key, spansYears(report.months!.map((x) => x.key))) + (m.partial ? "*" : ""),
                    values: m.totals === null ? [null, null] : [m.totals.income, m.totals.spent],
                  }))}
                  legend={[
                    { name: "Income", color: "green" },
                    { name: "Spent", color: "red" },
                  ]}
                  unit={base}
                />
              </div>
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
                          <FilterLink href={href({ period: "month", at: m.key })} className="hover:underline">{m.label}</FilterLink>
                          {m.partial && <span className="text-[10px] text-[var(--muted)]"> · part of the month</span>}
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
                          <span translate="no">{c.name}</span>
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
                      <span><span translate="no">{b.name}</span></span>
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
                          <span translate="no">{e.name}</span>
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

      {loaded.investments !== null && (
        <>
          {report !== null && <h3 className="text-base font-semibold pt-2">Investments</h3>}
          <InvestmentReportSection report={loaded.investments} currency={base} />
        </>
      )}
    </div>
  );
}
