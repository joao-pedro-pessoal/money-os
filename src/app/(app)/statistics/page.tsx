import ResponsiveTable from "@/components/ResponsiveTable";
import { getStatistics } from "@/actions/stats";
import { Money } from "@/components/PrivacyContext";
import PageTabs from "@/components/PageTabs";
import { ANALYTICS_TABS } from "@/lib/navigation";
import BenchmarkCard from "@/components/BenchmarkCard";
import Section from "@/components/Section";
import TrendsViews from "@/components/TrendsViews";
import ProjectionScenario from "@/components/ProjectionScenario";
import IndependencePlan from "@/components/IndependencePlan";

export default async function StatisticsPage() {
  const s = await getStatistics();
  const c = s.baseCurrency;
  const recent = s.flows.slice(-3);
  const basis = recent.length === 1 ? 'recorded transactions in ' + recent[0].month :
    recent.length > 1 ? 'the last ' + recent.length + ' recorded months (' + recent[0].month + ' to ' + recent.at(-1)!.month + ')' : 'no recorded months';

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <PageTabs tabs={ANALYTICS_TABS} />

      {/* Every figure on this page is converted to the base currency first.
          Anything that had no rate is left out and named here, rather than
          counted as though it were already in {c}. */}
      {s.unconverted.length > 0 && (
        <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
          <div className="text-sm">Some amounts could not be converted to {c}</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            No exchange rate for {s.unconverted.join(", ")}. Transactions, balances and bucket
            allocations in {s.unconverted.length === 1 ? "that currency" : "those currencies"} are
            left out of every figure below rather than counted as {c}. Add a rate in Settings.
          </div>
        </div>
      )}

      <TrendsViews progress={<>
        <p className="text-sm text-[var(--muted)]">Understand what you have saved and how your net worth has changed.</p>
      {/* ---- Savings & cash flow ---- */}
      <Section
        title="Your monthly cash flow" persistKey="Saving & spending"
        defaultOpen
        essential
        summary={s.avgSavingsRate === null ? undefined : `${s.avgSavingsRate.toFixed(1)}% saved`}
      >
        <p className="text-xs text-[var(--muted)] mb-4">Income minus expenses is what you kept that month. Transfers between your accounts are excluded.</p>
        {s.flows.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center">
            No income or expenses recorded yet — add transactions or import a statement.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Income kept</div>
                <div className="text-lg font-semibold">
                  {s.avgSavingsRate === null ? "—" : `${s.avgSavingsRate.toFixed(1)}%`}
                </div>
                <div className="text-[10px] text-[var(--muted)]">Average monthly rate across recorded months with income</div>
              </div>
              <Stat label="Average monthly surplus" value={s.avgMonthlySaving} currency={c} note={basis} />
              <Stat label="Average monthly spending" value={s.avgMonthlyExpenses} currency={c} note={basis} />
              <div>
                <div className="text-xs text-[var(--muted)] mb-1">Cash covers</div>
                <div className="text-lg font-semibold">
                  {s.runwayMonths === null ? "—" : `${s.runwayMonths.toFixed(1)} months`}
                </div>
                <div className="text-[10px] text-[var(--muted)]">Current cash divided by average monthly spending</div>
              </div>
            </div>

            <details className="mt-3"><summary className="cursor-pointer text-sm py-2">Monthly breakdown ({Math.min(s.flows.length, 12)} months)</summary>
            <div className="overflow-x-auto">
              <div className="table-scroll" role="region" aria-label="Scrollable data table" tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Income</th>
                    <th className="text-right">Expenses</th>
                    <th className="text-right">Surplus</th>
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
              </ResponsiveTable></div>
            </div></details>
          </>
        )}
      </Section>

      {/* ---- Returns by period ---- */}
      <Section title="Net worth changes" persistKey="How the money has moved" defaultOpen essential>
        <p className="text-xs text-[var(--muted)] mb-4">Change in your recorded net worth over each period. Includes money added or withdrawn as well as market movements; this is not an investment return.</p>
        {s.historyPoints < 2 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center">
            Not enough history yet. This fills in as balances change — each update adds a point.
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {s.returns.map((r) => (
              <div key={r.key}>
                <div className="text-xs text-[var(--muted)] mb-1">{r.label}</div>
                {r.change === null ? (
                  <div className="text-sm text-[var(--muted)]">Not enough history</div>
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
      </Section>

      {/* ---- Drawdown ---- */}
      {s.drawdown.maxDrawdown > 0 && (
        <Section
          title="Falls in net worth" persistKey="Worst fall so far"
          defaultOpen
          summary={`${s.drawdown.maxDrawdownPercent.toFixed(1)}% from peak`}
        >
          <p className="text-xs text-[var(--muted)] mb-4">The largest recorded fall from a previous high. Withdrawals and account changes can also cause a fall.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        </Section>
      )}


        <Section title="Investment return vs the market" persistKey="market-comparison" defaultOpen={false}>
          <p className="text-xs text-[var(--muted)] mb-3">Compare investment performance after removing the effect of deposits and withdrawals.</p>
          <BenchmarkCard />
        </Section>
        <Section title="How your money is spread" persistKey="concentration" defaultOpen={false}>
          <p className="text-xs text-[var(--muted)] mb-3">See how much is concentrated in one account or position.</p>
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


        </Section>
      </>} scenarios={<>
        <p className="text-sm text-[var(--muted)]">Explore assumptions about the future. These examples are separate from your recorded progress.</p>
        <ProjectionScenario current={s.netWorth.total} monthlySaving={s.flows.length > 0 ? s.avgMonthlySaving : null} basis={basis} currency={c} />
        <IndependencePlan
          current={s.netWorth.total}
          monthlySaving={s.flows.length > 0 ? s.avgMonthlySaving : null}
          monthlySpending={s.flows.length > 0 ? s.avgMonthlyExpenses : null}
          basis={basis}
          currency={c}
        />
      {/* ---- Bucket goals ---- */}
      {s.bucketProgress.length > 0 && (
        <Section
          title="Time to reach each goal" persistKey="When each goal arrives"
          defaultOpen
          summary={`${s.bucketProgress.length} ${s.bucketProgress.length === 1 ? "goal" : "goals"}`}
        >
          <p className="text-xs text-[var(--muted)] mb-4">Each estimate assumes your entire average monthly surplus goes to that goal alone. These dates do not describe a plan to fund all goals at once.</p>
          <div className="space-y-3">
            {s.bucketProgress.map((b) => (
              <div key={b.id}>
                <div className="flex flex-wrap justify-between gap-2 text-sm mb-1">
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
        </Section>
      )}

      </>} />
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
  // Each instance is titled differently, so Section's default persistKey keeps
  // "Across accounts" and "Across positions" folding independently.
  if (data.largestName === null) {
    return (
      <Section title={title} defaultOpen summary="nothing yet">
        <div className="text-sm text-[var(--muted)] py-4 text-center">Nothing to measure yet.</div>
      </Section>
    );
  }

  // Above ~25% in one place is where a single failure really hurts.
  const risky = data.largestShare > 25;

  return (
    <Section title={title} defaultOpen summary={`${data.largestShare.toFixed(1)}% largest`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">Biggest {what}</div>
          <div className={`text-lg font-semibold ${risky ? "text-[var(--amber)]" : ""}`}>
            {data.largestShare.toFixed(1)}%
          </div>
          <div className="text-xs text-[var(--muted)] truncate">{data.largestName}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--muted)] mb-1">Equivalent equal-sized spread</div>
          <div className="text-lg font-semibold">{data.effectiveCount.toFixed(1)}</div>
          <div className="text-[10px] text-[var(--muted)]">
            behaves like this many equal {what}s
          </div>
        </div>
      </div>
      {risky && (
        <div className="text-xs text-[var(--amber)] mt-3">
          {data.largestShare.toFixed(0)}% sits in {data.largestName}. A large share of the measured total depends on this one place.
        </div>
      )}
    </Section>
  );
}
