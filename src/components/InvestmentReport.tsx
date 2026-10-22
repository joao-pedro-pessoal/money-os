"use client";

import { useText } from "@/components/useText";
import SymbolName from "@/components/SymbolName";
import Link from "next/link";
import { Money } from "./PrivacyContext";
import Percent from "./Percent";
import ReportChart from "./ReportChart";
import ResponsiveTable from "./ResponsiveTable";
import type { InvestmentReport } from "@/lib/reports/investments";

const tone = (n: number) => (n > 0 ? "text-[var(--green)]" : n < 0 ? "text-[var(--red)]" : "");
/** An index's return: market data anyone can look up, so privacy mode leaves it alone. */
const indexPercent = (fraction: number) => `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(2)}%`;
/** A return on your own money, hidden by privacy mode. */
const ownReturn = (fraction: number) => <Percent value={fraction * 100} digits={2} signed />;

function Signed({ value, currency }: { value: number; currency: string }) {
  return (
    <span className={tone(value)}>
      {value > 0 ? "+" : ""}
      <Money value={value} currency={currency} />
    </span>
  );
}

function Card({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  const uiText = useText();
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)]">{uiText(label ?? "")}</div>
      <div className="text-xl font-semibold mt-1">{children}</div>
      {note && <div className="text-[11px] text-[var(--muted)] mt-1">{typeof note === "string" ? uiText(note) : note}</div>}
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
  const uiText = useText();
  if (!report.hasAnything) {
    return (
      <div className="card p-6 text-center text-sm text-[var(--muted)]">{uiText("No investment was valued, bought, sold or paid anything in this period.")}{" "}
        <Link href="/investments" className="text-[var(--accent)]">{uiText("Investments")}</Link>
      </div>
    );
  }

  const twr = report.returns.timeWeighted;
  const index = report.benchmark !== null && "indexReturn" in report.benchmark ? report.benchmark : null;

  return (
    <div className="space-y-3">
      <div className="report-cards grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label={uiText("Portfolio value")}
          note={
            report.value ? (
              <>{uiText("from ")}<Money value={report.value.start} currency={currency} />{uiText(" on ")}{report.value.startDate} (
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
          label={uiText("Deposited")}
          note={
            <>
              {report.flows.withdrawn > 0 ? (
                <>
                  <Money value={report.flows.withdrawn} currency={currency} />{uiText(" withdrawn")}</>
              ) : (
                uiText("{0} {1} in or out", { "0": report.flows.count, "1": report.flows.count === 1 ? "movement" : "movements" })
              )}
              {/* A zero here may be a deposit nobody recorded; say so rather than let it read as none. */}
              {!report.flows.complete && " · only what platforms report"}
            </>
          }
        >
          <Money value={report.flows.deposited} currency={currency} />
        </Card>
        <Card
          label={uiText("Change beyond deposits")}
          note={
            report.unexplainedWithheld ??
            (report.value ? `what markets did, between ${report.value.startDate} and ${report.value.endDate}` : undefined)
          }
        >
          {report.unexplained === null ? "—" : <Signed value={report.unexplained} currency={currency} />}
        </Card>
        <Card
          label={uiText("Dividends and interest")}
          note={
            <>
              <Money value={report.income.dividends} currency={currency} />{uiText(" dividends ·")}{" "}
              <Money value={report.income.interest} currency={currency} />{uiText(" interest")}</>
          }
        >
          <span className="text-[var(--green)]">
            <Money value={report.income.total} currency={currency} />
          </span>
        </Card>
      </div>

      <div className="report-cards grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label={uiText("Bought")} note={`${report.trades.buys} ${report.trades.buys === 1 ? "buy" : "buys"}`}>
          <Money value={report.trades.bought} currency={currency} />
        </Card>
        <Card label={uiText("Sold")} note={`${report.trades.sells} ${report.trades.sells === 1 ? "sale" : "sales"}`}>
          <Money value={report.trades.sold} currency={currency} />
        </Card>
        <Card
          label={uiText("Realised from trades")}
          note={`${report.trades.closed} closing ${report.trades.closed === 1 ? "fill" : "fills"}, as the venues state it`}
        >
          <Signed value={report.trades.realised} currency={currency} />
        </Card>
        <Card
          label={uiText("Trading fees")}
          note={
            <>{uiText("net of fees ")}<Signed value={report.trades.net} currency={currency} />
            </>
          }
        >
          <Money value={report.trades.fees} currency={currency} />
        </Card>
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-sm font-medium">{uiText("Return over the period")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-[var(--muted)]">{uiText("Time-weighted · how the choices did")}</div>
            <div className={`text-lg font-semibold ${twr ? tone(twr.total) : ""}`}>{twr ? ownReturn(twr.total) : "—"}</div>
            {twr && (
              <div className="text-[11px] text-[var(--muted)]">
                {twr.from}{uiText(" to ")}{twr.to}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">{uiText("Money-weighted · how your money did")}</div>
            <div className={`text-lg font-semibold ${report.returns.moneyWeighted === null ? "" : tone(report.returns.moneyWeighted)}`}>
              {report.returns.moneyWeighted === null ? "—" : ownReturn(report.returns.moneyWeighted)}
            </div>
          </div>
          {report.benchmark !== null && (
            <div>
              <div className="text-xs text-[var(--muted)]"><span translate="no">{report.benchmark.name}</span></div>
              <div className="text-lg font-semibold">{index ? indexPercent(index.indexReturn) : "—"}</div>
              {index && (
                // Your return minus the index's, so it reveals yours: hidden like it.
                <div className={`text-[11px] ${tone(index.differencePoints)}`}>
                  <Percent value={index.differencePoints} digits={2} signed suffix=" points" />{" "}
                  {index.differencePoints >= 0 ? uiText("ahead") : uiText("behind")}
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
            title={uiText("Growth of 100, against {0}", { "0": index.name })}
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
            title={uiText("Portfolio value through the period")}
            series={[{ name: "Portfolio value", color: "accent", points: report.valueLine }]}
            range={{ from: report.from, to: report.to }}
            unit={currency}
          />
        </div>
      )}

      {report.trades.bySymbol.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">{uiText("Result by instrument")}</div>
          <div className="table-scroll" role="region" aria-label={uiText("Result by instrument")} tabIndex={0}>
            <ResponsiveTable className="data-table">
              <thead>
                <tr>
                  <th>{uiText("Instrument")}</th>
                  <th className="text-right">{uiText("Closed")}</th>
                  <th className="text-right">{uiText("Realised")}</th>
                  <th className="text-right">{uiText("Fees")}</th>
                  <th className="text-right">{uiText("Net")}</th>
                </tr>
              </thead>
              <tbody>
                {report.trades.bySymbol.map((s) => (
                  <tr key={s.symbol}>
                    <td><SymbolName symbol={s.symbol} short /></td>
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
          <div className="text-sm font-medium mb-3">{uiText("Dividends by instrument")}</div>
          <div className="space-y-1.5">
            {report.income.byInstrument.map((d) => (
              <div key={d.name} className="flex justify-between gap-3 text-sm">
                <span>
                  <span translate="no">{d.name}</span> <span className="text-xs text-[var(--muted)]">· {d.payments} {d.payments === 1 ? uiText("payment") : uiText("payments")}</span>
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
            <div className="text-sm font-medium">
              {report.composition.today ? uiText("What is held today") : uiText("What was held on {0}", { "0": report.composition.asOf })}
            </div>
            <div className="text-sm">
              <Money value={report.composition.held} currency={currency} />
            </div>
          </div>
          <div className="space-y-2">
            {report.composition.byType.map((t) => (
              <div key={t.name}>
                <div className="flex justify-between text-xs gap-3">
                  <span><span translate="no">{t.name}</span></span>
                  <span className="text-[var(--muted)]">
                    <Money value={t.value} currency={currency} /> · <Percent value={t.percent} />
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden mt-1" aria-hidden="true">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, t.percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="table-scroll" role="region" aria-label={uiText("Largest positions")} tabIndex={0}>
            <ResponsiveTable className="data-table">
              <thead>
                <tr>
                  <th>{uiText("Position")}</th>
                  <th>{uiText("Account")}</th>
                  <th className="text-right">{uiText("Value")}</th>
                  <th className="text-right">{uiText("Share")}</th>
                  {report.composition.today && <th className="text-right">{uiText("Unrealised")}</th>}
                </tr>
              </thead>
              <tbody>
                {report.composition.largest.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <td><span translate="no">{p.name}</span></td>
                    <td className="text-[var(--muted)]">{p.account}</td>
                    <td className="text-right"><Money value={p.value} currency={currency} /></td>
                    <td className="text-right"><Percent value={p.percent} /></td>
                    {report.composition?.today && (
                      <td className="text-right">{p.pnl === null ? "—" : <Signed value={p.pnl} currency={currency} />}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
          {report.composition.unrealised !== null && (
            <p className="text-[11px] text-[var(--muted)]">{uiText("Unrealised today ")}<Signed value={report.composition.unrealised} currency={currency} />
              {report.composition.costUnknown > 0 && (
                <>{uiText(", leaving out ")}<Money value={report.composition.costUnknown} currency={currency} />{uiText(" whose cost nobody states")}</>
              )}
              .
            </p>
          )}
          {report.compositionNote && <p className="text-[11px] text-[var(--muted)]">{report.compositionNote}</p>}
        </div>
      ) : (
        report.compositionNote && <p className="text-xs text-[var(--muted)]">{report.compositionNote}</p>
      )}
    </div>
  );
}
