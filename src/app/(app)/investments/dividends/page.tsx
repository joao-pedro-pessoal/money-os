import ResponsiveTable from "@/components/ResponsiveTable";
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

/** The ticker in a round badge, so a list of payers can be scanned by shape. */
function TickerBadge({ ticker }: { ticker: string }) {
  const short = ticker.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "?";
  return (
    <span className="dividend-badge" aria-hidden="true">
      {short}
    </span>
  );
}

const rhythmLabel = (r: { cadence: string | null; medianGapDays: number | null }) =>
  r.cadence ? r.cadence : r.medianGapDays ? `every ~${r.medianGapDays}d` : null;

export default async function DividendsPage() {
  const o = await getDividendOverview();

  return (
    <div className="dividends-page space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Dividends & income</h1>
        <p className="dividends-intro text-xs text-[var(--muted)] mt-1 max-w-2xl">
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
          {/* On a phone the four cards become one: the total first, what it is
              made of beneath it. Same figures as the cards. */}
          <div className="dividends-phone-only card dividends-hero">
            <div className="text-xs text-[var(--muted)]">Received, all time</div>
            <div className="text-3xl font-semibold mt-1 text-[var(--green)]">
              <Money value={o.totalAll} currency={o.currency} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="dividends-mini">
                <div className="text-[11px] text-[var(--muted)]">From instruments</div>
                <div className="font-semibold mt-0.5">
                  <Money value={o.totalDistributions} currency={o.currency} />
                </div>
              </div>
              <div className="dividends-mini">
                <div className="text-[11px] text-[var(--muted)]">Interest on cash</div>
                <div className="font-semibold mt-0.5">
                  <Money value={o.totalInterest} currency={o.currency} />
                </div>
              </div>
            </div>
            <div className="text-xs text-[var(--muted)] mt-3">
              {o.byTicker.length} paying {o.byTicker.length === 1 ? "instrument" : "instruments"}
            </div>
          </div>

          <div className="dividends-desktop-only grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

          {/* Where each figure came from.
              A payment can be recorded three ways — by a connector, by a broker
              statement, or by a CSV import — and this page once read only the
              first, so thirteen real distributions sitting in a statement were
              invisible behind a confident total. One source wins per account
              and per kind; the rest are kept as cross-checks and never added,
              because on this account the same three payments exist twice. */}
          {o.sources.length > 0 && (
            <details className="dividends-sources card p-4">
              <summary className="text-xs cursor-pointer text-[var(--muted)]">
                Where these figures come from
                {o.crossCheckOnly > 0 && ` · ${o.crossCheckOnly} record${o.crossCheckOnly === 1 ? "" : "s"} held back as a duplicate`}
              </summary>
              <div className="table-scroll" role="region" aria-label="Scrollable data table" tabIndex={0}><ResponsiveTable className="data-table text-xs mt-3">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Kind</th>
                    <th>Counted from</th>
                    <th>Also recorded in</th>
                  </tr>
                </thead>
                <tbody>
                  {o.sources.map((s) => (
                    <tr key={`${s.accountId}-${s.kind}`}>
                      <td>{s.accountName}</td>
                      <td>{s.kind === "interest" ? "interest" : "distributions"}</td>
                      <td>{s.source}</td>
                      <td className="text-[var(--muted)]">
                        {s.others.length === 0 ? "—" : s.others.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable></div>
              <p className="text-[10px] text-[var(--muted)] mt-2 leading-relaxed">
                A payment held in two places is counted once, from the source above. The other
                copy is kept rather than deleted, so a disagreement between a broker&apos;s own
                figures and an imported file stays visible instead of being resolved silently.
              </p>
            </details>
          )}

          {/* Estimates first, and labelled as estimates in the heading itself. */}
          {o.upcoming.length > 0 && (
            <div className="dividends-expected card p-4">
              <div className="text-sm font-medium">Expected next</div>
              <p className="dividends-long-note text-xs text-[var(--muted)] mt-1 mb-3 max-w-2xl">
                Worked out from the rhythm of your own payments. No platform publishes a forward
                dividend calendar through its API, so these are patterns, not announcements — a
                company can cut, delay or stop a dividend without warning.
              </p>
              <div className="space-y-2">
                {o.upcoming.map((t) => (
                  <div key={t.ticker} className="dividends-expected-row flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="dividends-phone-only"><TickerBadge ticker={t.ticker} /></span>
                      <div className="min-w-0">
                        <span className="font-medium break-words">{t.instrumentName ?? t.ticker}</span>
                        <span className="text-[var(--muted)]"> · {t.ticker}</span>
                      </div>
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
              <p className="dividends-phone-only text-[10px] text-[var(--muted)] mt-3">
                Estimates from the rhythm of past payments, not announcements.
              </p>
            </div>
          )}

          <div className="card p-4">
            <div className="text-sm font-medium">Instruments that pay you</div>
            <p className="dividends-long-note text-xs text-[var(--muted)] mt-1 mb-3">
              Only positions that have actually paid a distribution. Accumulating ETFs reinvest
              internally and never appear here, which is not the same as paying nothing.
            </p>
            <ul className="dividends-phone-only dividends-list mt-3">
              {o.byTicker.map((t) => {
                const rhythm = rhythmLabel(t.rhythm);
                return (
                  <li key={t.ticker} className="dividends-item">
                    <TickerBadge ticker={t.ticker} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm break-words">{t.instrumentName ?? t.ticker}</div>
                          <div className="text-[11px] text-[var(--muted)]">{t.ticker}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-[var(--green)]">
                            <Money value={t.total} currency={t.currency} />
                          </div>
                          <div className="text-[10px] text-[var(--muted)]">
                            {t.payments} {t.payments === 1 ? "payment" : "payments"}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {rhythm && <span className="dividends-chip">{rhythm}</span>}
                        {t.trailingYield !== null && <span className="dividends-chip">{t.trailingYield}% last 12m</span>}
                        <span className="dividends-chip">
                          Last {dateLabel(t.lastPaidOn)} · <Money value={t.lastAmount} currency={t.currency} />
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="dividends-desktop-only overflow-x-auto">
              <div className="table-scroll" role="region" aria-label="Scrollable data table" tabIndex={0}><ResponsiveTable className="data-table">
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
              </ResponsiveTable></div>
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
              <div className="dividends-years space-y-1">
                {o.byYear.map((y) => {
                  const max = Math.max(...o.byYear.map((x) => x.total));
                  return (
                    <div key={y.year} className="dividends-year flex items-center gap-2 text-xs">
                      <span className="dividends-year-label w-12">{y.year}</span>
                      <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--green)]"
                          style={{ width: `${max === 0 ? 0 : (y.total / max) * 100}%` }}
                        />
                      </div>
                      <span className="dividends-year-amount w-24 text-right">
                        <Money value={y.total} currency={o.currency} />
                      </span>
                      <span className="dividends-year-count w-20 text-right text-[var(--muted)]">
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
            <div className="dividends-phone-only mt-3">
              {o.recent.map((p, i) => {
                const month = monthLabel(p.paidOn);
                const newMonth = i === 0 || monthLabel(o.recent[i - 1].paidOn) !== month;
                return (
                  <div key={`${p.ticker}-${p.paidOn.toISOString()}-${i}`}>
                    {newMonth && <div className="dividends-month">{month}</div>}
                    <div className="dividends-payment">
                      <TickerBadge ticker={p.ticker} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm break-words">{p.instrumentName ?? p.ticker}</div>
                        <div className="text-[11px] text-[var(--muted)] break-words">
                          {dateLabel(p.paidOn)} · {p.accountName}
                          {p.grossPerShare !== null && ` · ${p.grossPerShare} per share`}
                        </div>
                      </div>
                      <div className="font-semibold text-[var(--green)] shrink-0">
                        <Money value={p.amount} currency={p.currency} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="dividends-desktop-only overflow-x-auto">
              <div className="table-scroll" role="region" aria-label="Scrollable data table" tabIndex={0}><ResponsiveTable className="data-table">
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
              </ResponsiveTable></div>
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-2">
              &quot;Per share&quot; is gross, in the instrument&apos;s own currency. The amount is
              what actually landed in your account&apos;s currency, after withholding — so the two
              will not multiply out, and shouldn&apos;t.
            </p>
          </Section>
        </>
      )}

      <p className="dividends-footer text-[10px] text-[var(--muted)]">
        Read from Trading 212&apos;s payment history.{" "}
        <Link href="/connections" className="text-[var(--accent)]">
          Other platforms
        </Link>{" "}
        report no distributions, so nothing from them appears here.
      </p>
    </div>
  );
}
