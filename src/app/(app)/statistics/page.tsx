import { getStatistics } from "@/actions/stats";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function StatisticsPage() {
  const s = await getStatistics();
  const c = s.baseCurrency;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Statistics</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Everything here is measured from your own history, not estimated.
          </p>
        </div>
        <Link href="/analytics" className="btn whitespace-nowrap">
          Charts
        </Link>
      </div>

      {/* ---- Returns by period ---- */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">How the money has moved</div>
        {s.historyPoints < 2 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center">
            Not enough history yet. This fills in as balances change — each update adds a point.
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {s.returns.map((r) => (
              <div key={r.key}>
                <div className="text-xs text-[var(--muted)] mb-1">{r.label}</div>
                {r.change === null ? (
                  <div className="text-sm text-[var(--muted)]">no data</div>
                ) : (
                  <>
                    <div
                      className={`text-lg font-semibold truncate ${
                        r.change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                      }`}
                    >
                      {r.change >= 0 ? "+" : "−"}
                      <Money value={Math.abs(r.change)} currency={c} />
                    </div>
                    {r.percent !== null && (
                      <div className="text-xs text-[var(--muted)]">
                        {r.percent >= 0 ? "+" : ""}
                        {r.percent.toFixed(1)}%
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Drawdown ---- */}
      {s.drawdown.maxDrawdown > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Worst fall so far</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              label="Biggest drop"
              value={s.drawdown.maxDrawdown}
              currency={c}
              className="text-[var(--red)]"
              note={`${s.drawdown.maxDrawdownPercent.toFixed(1)}% from the peak`}
            />
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">From peak</div>
              <div className="text-sm">
                <Money value={s.drawdown.peak} currency={c} />
              </div>
              <div className="text-xs text-[var(--muted)]">{s.drawdown.peakDate}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Down to</div>
              <div className="text-sm">
                <Money value={s.drawdown.trough} currency={c} />
              </div>
              <div className="text-xs text-[var(--muted)]">{s.drawdown.troughDate}</div>
            </div>
            <Stat
              label="Below all-time high"
              value={s.drawdown.currentDrawdown}
              currency={c}
              className={s.drawdown.currentDrawdown > 0 ? "text-[var(--amber)]" : "text-[var(--green)]"}
              note={
                s.drawdown.currentDrawdown > 0
                  ? `${s.drawdown.currentDrawdownPercent.toFixed(1)}% below`
                  : "at the high"
              }
            />
          </div>
        </div>
      )}

      {/* ---- Savings & cash flow ---- */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Saving &amp; spending</div>
        {s.flows.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center">
            No income or expenses recorded yet — add transactions or import a statement.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Average savings rate</div>
                <div className="text-lg font-semibold">
                  {s.avgSavingsRate === null ? "—" : `${s.avgSavingsRate.toFixed(1)}%`}
                </div>
              </div>
              <Stat label="Saved per month" value={s.avgMonthlySaving} currency={c} note="last 3 months" />
              <Stat label="Spent per month" value={s.avgMonthlyExpenses} currency={c} note="last 3 months" />
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Runway</div>
                <div className="text-lg font-semibold">
                  {s.runwayMonths === null ? "—" : `${s.runwayMonths.toFixed(1)} months`}
                </div>
                <div className="text-[10px] text-[var(--muted)]">cash ÷ monthly spending</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">In</th>
                    <th className="text-right">Out</th>
                    <th className="text-right">Net</th>
                    <th className="text-right">Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.flows].reverse().slice(0, 12).map((f) => (
                    <tr key={f.month}>
                      <td>{f.month}</td>
                      <td className="text-right text-[var(--green)]">
                        <Money value={f.income} currency={c} />
                      </td>
                      <td className="text-right text-[var(--red)]">
                        <Money value={f.expenses} currency={c} />
                      </td>
                      <td className={`text-right ${f.net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                        <Money value={f.net} currency={c} />
                      </td>
                      <td className="text-right">
                        {f.savingsRate === null ? "—" : `${f.savingsRate.toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ---- Concentration ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConcentrationCard
          title="Across accounts"
          data={s.concentrationByAccount}
          what="account"
        />
        <ConcentrationCard
          title="Across positions"
          data={s.concentrationByPosition}
          what="position"
        />
      </div>

      {/* ---- Projections ---- */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-1">If nothing changes</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Arithmetic on two assumptions: that you keep saving{" "}
          <Money value={s.avgMonthlySaving} currency={c} /> a month, and a steady annual return. Real markets
          don&apos;t return a constant rate — this is a rough sense of scale, not a forecast.
        </p>
        <div className="overflow-x-auto">
          <table className="data-table whitespace-nowrap">
            <thead>
              <tr>
                <th>Horizon</th>
                <th className="text-right">At 5% a year</th>
                <th className="text-right">At 8% a year</th>
              </tr>
            </thead>
            <tbody>
              {s.projections.map((p, i) => (
                <tr key={p.years}>
                  <td>{p.years} {p.years === 1 ? "year" : "years"}</td>
                  <td className="text-right">
                    <Money value={p.value} currency={c} />
                  </td>
                  <td className="text-right text-[var(--muted)]">
                    <Money value={s.projectionsOptimistic[i].value} currency={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Bucket goals ---- */}
      {s.bucketProgress.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">When each goal arrives</div>
          <div className="space-y-3">
            {s.bucketProgress.map((b) => (
              <div key={b.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{b.name}</span>
                  <span className="text-[var(--muted)]">
                    <Money value={b.current} currency={c} /> / <Money value={b.target} currency={c} />
                    {b.months === 0 ? (
                      <span className="text-[var(--green)]"> · reached</span>
                    ) : b.months === null ? (
                      <span className="text-[var(--amber)]"> · not at the current rate</span>
                    ) : (
                      <span> · ~{b.months} {b.months === 1 ? "month" : "months"}</span>
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${b.percent}%`,
                      background: b.percent >= 100 ? "var(--green)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  currency,
  className = "",
  note,
}: {
  label: string;
  value: number;
  currency: string;
  className?: string;
  note?: string;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-lg font-semibold truncate ${className}`}>
        <Money value={value} currency={currency} />
      </div>
      {note && <div className="text-[10px] text-[var(--muted)]">{note}</div>}
    </div>
  );
}

function ConcentrationCard({
  title,
  data,
  what,
}: {
  title: string;
  data: { index: number; largestShare: number; largestName: string | null; effectiveCount: number };
  what: string;
}) {
  if (data.largestName === null) {
    return (
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">{title}</div>
        <div className="text-sm text-[var(--muted)] py-4 text-center">Nothing to measure yet.</div>
      </div>
    );
  }

  // Above ~25% in one place is where a single failure really hurts.
  const risky = data.largestShare > 25;

  return (
    <div className="card p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">Biggest {what}</div>
          <div className={`text-lg font-semibold ${risky ? "text-[var(--amber)]" : ""}`}>
            {data.largestShare.toFixed(1)}%
          </div>
          <div className="text-xs text-[var(--muted)] truncate">{data.largestName}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">Effective spread</div>
          <div className="text-lg font-semibold">{data.effectiveCount.toFixed(1)}</div>
          <div className="text-[10px] text-[var(--muted)]">
            behaves like this many equal {what}s
          </div>
        </div>
      </div>
      {risky && (
        <div className="text-xs text-[var(--amber)] mt-3">
          {data.largestShare.toFixed(0)}% sits in {data.largestName}. Worth knowing if that one fails.
        </div>
      )}
    </div>
  );
}
