import { getPortfolioAnalysis } from "@/actions/investments";
import { Money } from "@/components/PrivacyContext";
import DonutChart from "@/components/DonutChart";
import { tagLabel, riskColor } from "@/lib/portfolio/tags";
import type { Breakdown } from "@/lib/portfolio/analysis";
import Link from "next/link";

export default async function PortfolioAnalysisPage() {
  const a = await getPortfolioAnalysis();
  const pnlColor = a.totals.totalPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";

  if (a.holdings.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold">Portfolio analysis</h1>
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Nothing to analyse yet — <Link href="/investments" className="text-[var(--accent)]">add a position</Link> first.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Portfolio analysis</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Exposure, P&amp;L and yield across every position you track.
          </p>
        </div>
        <Link href="/investments" className="btn whitespace-nowrap">
          Back to positions
        </Link>
      </div>

      {/* ---- Headline numbers ---- */}
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Portfolio Value" value={a.totals.totalValue} />
        <Stat label="Cost Basis" value={a.totals.totalCost} />
        <Stat label="Unrealized P&L" value={a.totals.totalPnL} className={pnlColor} />
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L %</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>{a.totals.totalPnLPercent.toFixed(2)}%</div>
        </div>
      </div>

      {/* ---- Guaranteed vs market-exposed ---- */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Guaranteed vs market-exposed</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Stable (cash + stablecoins)</div>
            <div className="text-lg font-semibold text-[var(--green)]">
              <Money value={a.split.stable} />
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Floating (market-exposed)</div>
            <div className="text-lg font-semibold text-[var(--amber)]">
              <Money value={a.split.floating} />
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">% at market risk</div>
            <div className="text-lg font-semibold">{a.split.floatingPercent.toFixed(1)}%</div>
          </div>
        </div>
        <div className="mt-3 h-2 w-full rounded-full overflow-hidden flex bg-[var(--surface-2)]">
          <div style={{ width: `${100 - a.split.floatingPercent}%`, background: "var(--green)" }} />
          <div style={{ width: `${a.split.floatingPercent}%`, background: "var(--amber)" }} />
        </div>
      </div>

      {/* ---- Staking / yield ---- */}
      {(a.staking.stakedValue > 0 || a.staking.rewardsEarned > 0) && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Yield &amp; staking</div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Earning yield</div>
              <div className="text-lg font-semibold">
                <Money value={a.staking.stakedValue} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Weighted APR</div>
              <div className="text-lg font-semibold">{a.staking.weightedApr.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Projected / year</div>
              <div className="text-lg font-semibold text-[var(--accent)]">
                <Money value={a.staking.projectedAnnual} />
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Rewards received</div>
              <div className="text-lg font-semibold text-[var(--green)]">
                <Money value={a.staking.rewardsEarned} />
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] mt-3">
            &quot;Projected / year&quot; is an estimate (APR × current value), not realised income.
          </p>
        </div>
      )}

      {/* ---- Warnings ---- */}
      {(a.concentration.length > 0 || a.mismatches.length > 0) && (
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">Things worth a look</div>
          {a.concentration.map((c) => (
            <div key={c.key} className="text-sm text-[var(--muted)]">
              ⚠️ <span className="text-[var(--foreground)]">{c.key}</span> is {c.percent.toFixed(1)}% of the portfolio —
              a single position carrying most of the risk.
            </div>
          ))}
          {a.mismatches.map((m) => (
            <div key={m.id} className="text-sm text-[var(--muted)]">
              🕒 <span className="text-[var(--foreground)]">{m.symbol}</span> is tagged short term but{" "}
              {tagLabel(m.riskLevel)?.toLowerCase()} — money you may need soon sitting in a volatile position.
            </div>
          ))}
        </div>
      )}

      {/* ---- Breakdowns ---- */}
      <div className="grid grid-cols-2 gap-6">
        <BreakdownCard title="By account / wallet" rows={a.byAccount} donut />
        <BreakdownCard title="By asset type" rows={a.byAssetType} translate donut />
        <BreakdownCard title="By risk level" rows={a.byRisk} translate colorByRisk />
        <BreakdownCard title="By time horizon" rows={a.byTimeHorizon} translate />
      </div>

      {/* ---- Winners & losers ---- */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Biggest gains</div>
          <MoversTable rows={a.movers.winners} positive />
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Biggest losses</div>
          <MoversTable rows={a.movers.losers} />
        </div>
      </div>

      {/* ---- Full position table ---- */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">All positions</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Account</th>
              <th>Type</th>
              <th>Risk</th>
              <th>Horizon</th>
              <th>Value</th>
              <th>APR</th>
            </tr>
          </thead>
          <tbody>
            {a.holdings.map((h) => (
              <tr key={h.id}>
                <td>
                  <Link href={`/investments/${h.id}`} className="hover:underline font-medium">
                    {h.symbol}
                  </Link>
                </td>
                <td>{h.accountName ?? "—"}</td>
                <td>{tagLabel(h.assetType) ?? "—"}</td>
                <td style={{ color: riskColor(h.riskLevel) }}>{tagLabel(h.riskLevel) ?? "—"}</td>
                <td>{tagLabel(h.timeHorizon) ?? "—"}</td>
                <td>
                  <Money value={h.quantity * h.currentPrice} />
                </td>
                <td>{h.apr ? `${h.apr.toFixed(2)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold ${className}`}>
        <Money value={value} />
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  translate = false,
  donut = false,
  colorByRisk = false,
}: {
  title: string;
  rows: Breakdown[];
  translate?: boolean;
  donut?: boolean;
  colorByRisk?: boolean;
}) {
  const label = (key: string) => (translate ? tagLabel(key) ?? key : key);

  return (
    <div className="card p-4">
      <div className="text-sm font-medium mb-3">{title}</div>
      {donut && <DonutChart data={rows.map((r) => ({ name: label(r.key), value: r.value }))} />}
      <div className="space-y-2 mt-2">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex justify-between text-sm mb-1">
              <span style={colorByRisk ? { color: riskColor(r.key) } : undefined}>{label(r.key)}</span>
              <span className="text-[var(--muted)]">
                <Money value={r.value} /> · {r.percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                style={{
                  width: `${r.percent}%`,
                  background: colorByRisk ? riskColor(r.key) : "var(--accent)",
                }}
                className="h-full"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoversTable({
  rows,
  positive = false,
}: {
  rows: { id: string; symbol: string; pnl: number; value: number }[];
  positive?: boolean;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-[var(--muted)] py-4 text-center">None yet</div>;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Value</th>
          <th>P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/investments/${r.id}`} className="hover:underline">
                {r.symbol}
              </Link>
            </td>
            <td>
              <Money value={r.value} />
            </td>
            <td className={positive ? "text-[var(--green)]" : "text-[var(--red)]"}>
              <Money value={r.pnl} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
