import { getDividendOverview } from "@/actions/dividends";
import { Money } from "@/components/PrivacyContext";
import Section from "@/components/Section";
import Link from "next/link";

// No PageTabs here: everything under /investments already gets them from
// investments/layout.tsx, and rendering them again drew the bar twice.

const dateLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const CONFIDENCE_NOTE: Record<string, string> = {
  good: "from four or more payments",
  low: "from only two or three payments",
  none: "not enough history",
};

export default async function DividendsPage() {
  const o = await getDividendOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Dividends & income</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          Money that arrived without you selling anything. Everything below the estimates is what
          was actually paid, read from the platform&apos;s own history.
        </p>
      </div>

      {!o.hasAny ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          No distributions on record yet. They arrive with the next sync of a platform that reports
          them — Trading 212 does. If you hold only accumulating ETFs, there may genuinely be none:
          those reinvest internally instead of paying you.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-3">
              <div className="text-xs text-[var(--muted)]">Received, all time</div>
              <div className="text-lg font-semibold mt-1">
                <Money value={o.totalAll} currency={o.currency} />
              </div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-[var(--muted)]">From instruments</div>
              <div className="text-lg font-semibold mt-1">
                <Money value={o.totalDistributions} currency={o.currency} />
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-1">Dividends and distributions</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-[var(--muted)]">Interest on cash</div>
              <div className="text-lg font-semibold mt-1">
                <Money value={o.totalInterest} currency={o.currency} />
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-1">
                Kept separate — it says nothing about what a holding yields
              </div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-[var(--muted)]">Paying instruments</div>
              <div className="text-lg font-semibold mt-1">{o.byTicker.length}</div>
            </div>
          </div>

          {/* Estimates first, and labelled as estimates in the heading itself. */}
          {o.upcoming.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium">Expected next</div>
              <p className="text-xs text-[var(--muted)] mt-1 mb-3 max-w-2xl">
                Worked out from the rhythm of your own payments. No platform publishes a forward
                dividend calendar through its API, so these are patterns, not announcements — a
                company can cut, delay or stop a dividend without warning.
              </p>
              <div className="space-y-2">
                {o.upcoming.map((t) => (
                  <div key={t.ticker} className="flex items-baseline justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium">{t.instrumentName ?? t.ticker}</span>
                      <span className="text-[var(--muted)]"> · {t.ticker}</span>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div style={{ color: "var(--amber)" }}>
                        ~ {monthLabel(t.rhythm.estimatedNext!)}
                      </div>
                      <div className="text-[10px] text-[var(--muted)]">
                        {CONFIDENCE_NOTE[t.rhythm.confidence]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="text-sm font-medium">Instruments that pay you</div>
            <p className="text-xs text-[var(--muted)] mt-1 mb-3">
              Only positions that have actually paid a distribution. Accumulating ETFs reinvest
              internally and never appear here, which is not the same as paying nothing.
            </p>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Payments</th>
                    <th>Received</th>
                    <th>Last paid</th>
                    <th>Rhythm</th>
                    <th>Yield, 12m</th>
                  </tr>
                </thead>
                <tbody>
                  {o.byTicker.map((t) => (
                    <tr key={t.ticker}>
                      <td>
                        <div className="font-medium">{t.instrumentName ?? t.ticker}</div>
                        <div className="text-[10px] text-[var(--muted)]">{t.ticker}</div>
                      </td>
                      <td>{t.payments}</td>
                      <td>
                        <Money value={t.total} currency={t.currency} />
                      </td>
                      <td className="whitespace-nowrap">
                        {dateLabel(t.lastPaidOn)}
                        <div className="text-[10px] text-[var(--muted)]">
                          <Money value={t.lastAmount} currency={t.currency} />
                        </div>
                      </td>
                      <td className="text-xs text-[var(--muted)]" title={t.rhythm.summary}>
                        {t.rhythm.cadence
                          ? t.rhythm.cadence
                          : t.rhythm.medianGapDays
                            ? `every ~${t.rhythm.medianGapDays}d`
                            : "—"}
                      </td>
                      <td>
                        {/* Backward-looking and named so: what it did yield. */}
                        {t.trailingYield === null ? (
                          <span className="text-[var(--muted)]">—</span>
                        ) : (
                          `${t.trailingYield}%`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-2">
              Yield is what was actually paid over the last twelve months against today&apos;s
              value — it is history, not a forecast. Blank when there is no open position to
              measure against.
            </p>
          </div>

          {o.byYear.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-3">By year</div>
              <div className="space-y-1">
                {o.byYear.map((y) => {
                  const max = Math.max(...o.byYear.map((x) => x.total));
                  return (
                    <div key={y.year} className="flex items-center gap-2 text-xs">
                      <span className="w-12">{y.year}</span>
                      <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--green)]"
                          style={{ width: `${max === 0 ? 0 : (y.total / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-24 text-right">
                        <Money value={y.total} currency={o.currency} />
                      </span>
                      <span className="w-20 text-right text-[var(--muted)]">
                        {y.payments} {y.payments === 1 ? "payment" : "payments"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distributions only. Sixty-five interest credits of a cent each
              would bury the payments this page is about; the interest total is
              in the cards above. */}
          <Section
            title="Every dividend"
            summary={
              o.interestPayments > 0
                ? `${o.recent.length} shown · ${o.interestPayments} interest credits not listed`
                : `${o.recent.length} most recent`
            }
          >
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Paid on</th>
                    <th>Instrument</th>
                    <th>Kind</th>
                    <th>Per share</th>
                    <th>Amount</th>
                    <th>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {o.recent.map((p, i) => (
                    <tr key={`${p.ticker}-${p.paidOn.toISOString()}-${i}`}>
                      <td className="whitespace-nowrap">{dateLabel(p.paidOn)}</td>
                      <td>
                        <div>{p.instrumentName ?? p.ticker}</div>
                        <div className="text-[10px] text-[var(--muted)]">{p.ticker}</div>
                      </td>
                      <td className="text-[10px] text-[var(--muted)]">{p.type ?? "—"}</td>
                      <td className="text-xs text-[var(--muted)]">
                        {p.grossPerShare === null ? "—" : p.grossPerShare}
                      </td>
                      <td>
                        <Money value={p.amount} currency={p.currency} />
                      </td>
                      <td className="text-xs text-[var(--muted)]">{p.accountName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-2">
              &quot;Per share&quot; is gross, in the instrument&apos;s own currency. The amount is
              what actually landed in your account&apos;s currency, after withholding — so the two
              will not multiply out, and shouldn&apos;t.
            </p>
          </Section>
        </>
      )}

      <p className="text-[10px] text-[var(--muted)]">
        Read from Trading 212&apos;s payment history.{" "}
        <Link href="/connections" className="text-[var(--accent)]">
          Other platforms
        </Link>{" "}
        report no distributions, so nothing from them appears here.
      </p>
    </div>
  );
}
