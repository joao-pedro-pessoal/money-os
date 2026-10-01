import Link from "next/link";
import { Money } from "./PrivacyContext";
import ReportChart from "./ReportChart";
import ResponsiveTable from "./ResponsiveTable";
import type { InvestmentReport } from "@/lib/reports/investments";

const tone = (n: number) => (n > 0 ? "text-[var(--green)]" : n < 0 ? "text-[var(--red)]" : "");
const asPercent = (fraction: number) => `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(2)}%`;

function Signed({ value, currency }: { value: number; currency: string }) {
  return (
    <span className={tone(value)}>
      {value > 0 ? "+" : ""}
      <Money value={value} currency={currency} />
    </span>
  );
}

function Card({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-xl font-semibold mt-1">{children}</div>
      {note && <div className="text-[11px] text-[var(--muted)] mt-1">{note}</div>}
    </div>
  );
}

/**
 * The investing side of a report: the portfolio over the period, the money
 * that went in and out, what trading and dividends returned, how the period
 * performed against an index, and what is held — every figure from
 * `lib/reports/investments.ts`, the same object the CSV and the PDF read.
 */
export default function InvestmentReportSection({ report, currency }: { report: InvestmentReport; currency: string }) {
  if (!report.hasAnything) {
    return (
      <div className="card p-6 text-center text-sm text-[var(--muted)]">
        No investment was valued, bought, sold or paid anything in this period.{" "}
        <Link href="/investments" className="text-[var(--accent)]">Investments</Link>
      </div>
    );
  }

  const twr = report.returns.timeWeighted;
  const index = report.benchmark !== null && "indexReturn" in report.benchmark ? report.benchmark : null;

  return (
    <div className="space-y-3">
      <div className="report-cards grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label="Portfolio value"
          note={
            report.value ? (
              <>
                from <Money value={report.value.start} currency={currency} /> (
                <Signed value={report.value.change} currency={currency} />)
              </>
            ) : (
              "no valuation inside this period"
            )
          }
        >
          {report.value ? <Money value={report.value.end} currency={currency} /> : "—"}
        </Card>
        <Card
          label="Deposited"
          note={
            report.flows.withdrawn > 0 ? (
              <>
                <Money value={report.flows.withdrawn} currency={currency} /> withdrawn
              </>
            ) : (
              `${report.flows.count} ${report.flows.count === 1 ? "movement" : "movements"} in or out`
            )
          }
        >
          <Money value={report.flows.deposited} currency={currency} />
        </Card>
        <Card label="Change beyond deposits" note="markets, and money moved in or out without a recorded deposit or withdrawal">
          {report.unexplained === null ? "—" : <Signed value={report.unexplained} currency={currency} />}
        </Card>
        <Card
          label="Dividends and interest"
          note={
            <>
              <Money value={report.income.dividends} currency={currency} /> dividends ·{" "}
              <Money value={report.income.interest} currency={currency} /> interest
            </>
          }
        >
          <span className="text-[var(--green)]">
            <Money value={report.income.total} currency={currency} />
          </span>
        </Card>
      </div>

      <div className="report-cards grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Bought" note={`${report.trades.buys} ${report.trades.buys === 1 ? "buy" : "buys"}`}>
          <Money value={report.trades.bought} currency={currency} />
        </Card>
        <Card label="Sold" note={`${report.trades.sells} ${report.trades.sells === 1 ? "sale" : "sales"}`}>
          <Money value={report.trades.sold} currency={currency} />
        </Card>
        <Card
          label="Realised from trades"
          note={`${report.trades.closed} closing ${report.trades.closed === 1 ? "fill" : "fills"}, as the venues state it`}
        >
          <Signed value={report.trades.realised} currency={currency} />
        </Card>
        <Card
          label="Trading fees"
          note={
            <>
              net of fees <Signed value={report.trades.net} currency={currency} />
            </>
          }
        >
          <Money value={report.trades.fees} currency={currency} />
        </Card>
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium">Return over the period</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-[var(--muted)]">Time-weighted · how the choices did</div>
            <div className={`text-lg font-semibold ${twr ? tone(twr.total) : ""}`}>{twr ? asPercent(twr.total) : "—"}</div>
            {twr && (
              <div className="text-[11px] text-[var(--muted)]">
                {twr.from} to {twr.to}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">Money-weighted · how your money did</div>
            <div className={`text-lg font-semibold ${report.returns.moneyWeighted === null ? "" : tone(report.returns.moneyWeighted)}`}>
              {report.returns.moneyWeighted === null ? "—" : asPercent(report.returns.moneyWeighted)}
            </div>
          </div>
          {report.benchmark !== null && (
            <div>
              <div className="text-xs text-[var(--muted)]">{report.benchmark.name}</div>
              <div className="text-lg font-semibold">{index ? asPercent(index.indexReturn) : "—"}</div>
              {index && (
                <div className={`text-[11px] ${tone(index.differencePoints)}`}>
                  {index.differencePoints > 0 ? "+" : ""}
                  {index.differencePoints.toFixed(2)} points {index.differencePoints >= 0 ? "ahead" : "behind"}
                </div>
              )}
            </div>
          )}
        </div>
        {[report.returns.timeWeightedWithheld, report.returns.moneyWeightedWithheld].map(
          (reason, i) => reason && <p key={i} className="text-[11px] text-[var(--muted)]">{reason}</p>
        )}
        {report.benchmark !== null && "unavailable" in report.benchmark && twr !== null && (
          <p className="text-[11px] text-[var(--muted)]">{report.benchmark.unavailable}</p>
        )}
        {index && report.returns.curve.length >= 2 && (
          <ReportChart
            kind="line"
            title={`Growth of 100, against ${index.name}`}
            series={[
              { name: "Your portfolio (time-weighted)", color: "accent", points: report.returns.curve },
              { name: index.name, color: "muted", points: index.curve },
            ]}
            range={{ from: report.from, to: report.to }}
            unit="start = 100"
          />
        )}
      </div>

      {report.valueLine.length >= 2 && (
        <div className="card p-4">
          <ReportChart
            kind="line"
            title="Portfolio value through the period"
            series={[{ name: "Portfolio value", color: "accent", points: report.valueLine }]}
            range={{ from: report.from, to: report.to }}
            unit={currency}
          />
        </div>
      )}

      {report.trades.bySymbol.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Result by instrument</div>
          <div className="table-scroll" role="region" aria-label="Result by instrument" tabIndex={0}>
            <ResponsiveTable className="data-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="text-right">Closed</th>
                  <th className="text-right">Realised</th>
                  <th className="text-right">Fees</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {report.trades.bySymbol.map((s) => (
                  <tr key={s.symbol}>
                    <td>{s.symbol}</td>
                    <td className="text-right">{s.closedTrades}</td>
                    <td className="text-right"><Signed value={s.realized} currency={currency} /></td>
                    <td className="text-right"><Money value={s.fees} currency={currency} /></td>
                    <td className="text-right"><Signed value={s.net} currency={currency} /></td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        </div>
      )}

      {report.income.byInstrument.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Dividends by instrument</div>
          <div className="space-y-1.5">
            {report.income.byInstrument.map((d) => (
              <div key={d.name} className="flex justify-between gap-3 text-sm">
                <span>
                  {d.name} <span className="text-xs text-[var(--muted)]">· {d.payments} {d.payments === 1 ? "payment" : "payments"}</span>
                </span>
                <Money value={d.amount} currency={currency} />
              </div>
            ))}
          </div>
        </div>
      )}

      {report.composition !== null ? (
        <div className="card p-4 space-y-3">
          <div className="flex justify-between gap-3 flex-wrap">
            <div className="text-sm font-medium">What is held today</div>
            <div className="text-sm">
              <Money value={report.composition.held} currency={currency} />
            </div>
          </div>
          <div className="space-y-2">
            {report.composition.byType.map((t) => (
              <div key={t.name}>
                <div className="flex justify-between text-xs gap-3">
                  <span>{t.name}</span>
                  <span className="text-[var(--muted)]">
                    <Money value={t.value} currency={currency} /> · {t.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden mt-1" aria-hidden="true">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, t.percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="table-scroll" role="region" aria-label="Largest positions" tabIndex={0}>
            <ResponsiveTable className="data-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Account</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Unrealised</th>
                </tr>
              </thead>
              <tbody>
                {report.composition.largest.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <td>{p.name}</td>
                    <td className="text-[var(--muted)]">{p.account}</td>
                    <td className="text-right"><Money value={p.value} currency={currency} /></td>
                    <td className="text-right">{p.pnl === null ? "—" : <Signed value={p.pnl} currency={currency} />}</td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            Unrealised today <Signed value={report.composition.unrealised} currency={currency} />
            {report.composition.costUnknown > 0 && (
              <>
                , leaving out <Money value={report.composition.costUnknown} currency={currency} /> whose cost nobody states
              </>
            )}
            .
          </p>
        </div>
      ) : (
        report.compositionNote && <p className="text-xs text-[var(--muted)]">{report.compositionNote}</p>
      )}
    </div>
  );
}
