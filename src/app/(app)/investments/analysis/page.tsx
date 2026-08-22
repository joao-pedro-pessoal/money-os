import { getPortfolioAnalysis, getGroupedPerformance } from "@/actions/investments";
import { Money } from "@/components/PrivacyContext";
import DonutChart from "@/components/DonutChart";
import { tagLabel, riskColor } from "@/lib/portfolio/tags";
import {
  GROUP_BY_OPTIONS,
  SORT_COLUMNS,
  type Breakdown,
  type GroupByKey,
  type SortKey,
} from "@/lib/portfolio/analysis";
import { listAnalysisViews, saveAnalysisView, deleteSavedView } from "@/actions/savedViews";
import { suggestName } from "@/lib/portfolio/savedViews";
import SavedViews from "@/components/SavedViews";
import GainAttribution from "@/components/GainAttribution";
import ContributionBreakdown from "@/components/ContributionBreakdown";
import StatementBreakdown from "@/components/StatementBreakdown";
import { getStatementBreakdown } from "@/actions/brokerImport";
import Link from "next/link";

export default async function PortfolioAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ groupBy?: string; sort?: string; dir?: string; synced?: string }>;
}) {
  const sp = await searchParams;
  const groupBy = (GROUP_BY_OPTIONS.find((o) => o.value === sp.groupBy)?.value ?? "playlist") as GroupByKey;
  const sort = (SORT_COLUMNS.find((c) => c.key === sp.sort)?.key ?? "value") as SortKey;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  // Spot/stablecoins count by default; "off" narrows the view to at-risk positions.
  const includeSynced = sp.synced !== "off";

  const statement = await getStatementBreakdown();
  const a = await getPortfolioAnalysis(includeSynced);
  const grouped = await getGroupedPerformance(groupBy, sort, dir, includeSynced);
  const groupLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)!.label;
  const best = [...grouped].filter((g) => g.cost > 0).sort((x, y) => y.pnlPercent - x.pnlPercent)[0];
  const translateKeys = groupBy !== "playlist" && groupBy !== "account" && groupBy !== "symbol";
  const label = (k: string) => (translateKeys ? tagLabel(k) ?? k : k);
  const qs = (over: Record<string, string>) =>
    "?" +
    new URLSearchParams({ groupBy, sort, dir, synced: includeSynced ? "on" : "off", ...over }).toString();
  const pnlColor = a.totals.totalPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";

  const currentConfig = { groupBy, sort, dir, synced: includeSynced ? "on" : "off" };
  const savedViewList = await listAnalysisViews();
  // Same builder as the chips use, so "already saved" compares like with like.
  const currentQuery = new URLSearchParams(currentConfig).toString();
  const suggested = suggestName(currentConfig, {
    groupBy: Object.fromEntries(GROUP_BY_OPTIONS.map((o) => [o.value, o.label])),
    sort: Object.fromEntries(SORT_COLUMNS.map((c) => [c.key, c.label])),
  });

  /**
   * The empty state used to hide the whole page.
   *
   * `a.holdings` is what the risk analysis can group and rank — and it is empty
   * for someone whose money is entirely synced or entirely rebuilt from a
   * statement. Everything below it, including the statement breakdown and the
   * gain attribution, needs none of that and was being hidden along with it.
   *
   * So the empty state stays for the part that is genuinely empty, and the rest
   * of the page renders regardless.
   */
  if (a.holdings.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-lg font-semibold">Portfolio analysis</h1>
          {/* The toggle must stay reachable here, or switching it off with no
              manual positions would leave no way to switch it back on. */}
          <Link href={qs({ synced: includeSynced ? "off" : "on" })} className="btn whitespace-nowrap">
            {includeSynced ? "Cash & stablecoins: ON" : "Cash & stablecoins: OFF"}
          </Link>
        </div>
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          {includeSynced ? (
            <>
              Nothing to analyse yet —{" "}
              <Link href="/investments" className="text-[var(--accent)]">
                add a position
              </Link>{" "}
              first.
            </>
          ) : (
            <>
              No at-risk positions. Your money is all in spot or stablecoins — turn them back on above to see
              it here.
            </>
          )}
        </div>

        {/* Independent of the risk analysis above: these read the imported
            statement and the account history, not the tagged positions. */}
        <GainAttribution currency="EUR" />
        <ContributionBreakdown currency="EUR" />

        {statement && (
          <div>
            <div className="text-sm font-medium mb-3">From your imported statement</div>
            <StatementBreakdown data={statement} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Portfolio analysis</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Exposure, P&amp;L and yield across everything you hold — manual,
            imported and synced.{" "}
            {includeSynced
              ? "Cash and stablecoins are included."
              : "Cash and stablecoins are hidden, so this is what you're at risk on."}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Link
            href={qs({ synced: includeSynced ? "off" : "on" })}
            className="btn whitespace-nowrap"
            title="Cash and stablecoins can't lose value to the market, so they flatten every risk breakdown they're in. Hiding them leaves what's actually exposed."
          >
            {includeSynced ? "Cash & stablecoins: ON" : "Cash & stablecoins: OFF"}
          </Link>
          <Link href="/investments" className="btn whitespace-nowrap">
            Back to positions
          </Link>
        </div>
      </div>

      {/* Where the movement came from, before the headline numbers that mix
          the sources together. */}
      <GainAttribution currency="EUR" />
      <ContributionBreakdown currency="EUR" />

      {/* Everything below is read straight out of the imported statement, so it
          only appears once one has been imported. */}
      {statement && (
        <div>
          <div className="text-sm font-medium mb-3">From your imported statement</div>
          <StatementBreakdown data={statement} />
        </div>
      )}

      {/* ---- Headline numbers ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Portfolio Value" value={a.totals.totalValue} />
        <Stat label="Cost Basis" value={a.totals.totalCost} />
        <Stat label="Unrealized P&L" value={a.totals.totalPnL} className={pnlColor} />
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L %</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>{a.totals.totalPnLPercent.toFixed(2)}%</div>
        </div>
        <Stat
          label="Realized P&L"
          value={a.realizedTotal}
          className={a.realizedTotal >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}
        />
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

      {/* ---- Grouped performance: sortable by every variable ---- */}
      <div className="card p-4">
        {/* Nine groupings crossed with seven sort columns is a lot to rebuild by
            hand each visit; these are the two or three you actually use. */}
        <div className="mb-3 pb-3 border-b border-[var(--border)]">
          <SavedViews
            views={savedViewList}
            currentQuery={currentQuery}
            suggestedName={suggested}
            currentConfig={currentConfig}
            saveAction={saveAnalysisView}
            deleteAction={deleteSavedView}
          />
        </div>

        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">Performance by {groupLabel.toLowerCase()}</div>
            {best && (
              <div className="text-xs text-[var(--muted)] mt-1">
                Best: <span className="text-[var(--green)]">{label(best.key)}</span> at{" "}
                {best.pnlPercent.toFixed(1)}%
              </div>
            )}
          </div>
          <form method="GET" className="flex gap-2 text-xs">
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
            <select name="groupBy" defaultValue={groupBy} className="input py-1">
              {GROUP_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  Group by: {o.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn py-1 px-3">
              Apply
            </button>
          </form>
        </div>

        <DonutChart data={grouped.filter((g) => g.value > 0).map((g) => ({ name: label(g.key), value: g.value }))} />

        <div className="overflow-x-auto mt-4">
          <table className="data-table whitespace-nowrap">
            <thead>
              <tr>
                {SORT_COLUMNS.map((c) => (
                  <th key={c.key} className={c.numeric ? "text-right" : undefined}>
                    <Link
                      href={qs({ sort: c.key, dir: sort === c.key && dir === "desc" ? "asc" : "desc" })}
                      className="hover:underline"
                    >
                      {c.label}
                      {sort === c.key && (dir === "desc" ? " ↓" : " ↑")}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <tr key={g.key}>
                  <td>
                    <span style={groupBy === "riskLevel" ? { color: riskColor(g.key) } : undefined}>
                      {label(g.key)}
                    </span>
                    <div className="text-xs text-[var(--muted)]">{g.percent.toFixed(1)}% do portefólio</div>
                  </td>
                  <td className="text-right">{g.count}</td>
                  <td className="text-right">
                    <Money value={g.value} />
                  </td>
                  <td className="text-right">
                    <Money value={g.cost} />
                  </td>
                  <td className={`text-right ${g.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    <Money value={g.pnl} />
                  </td>
                  <td className={`text-right ${g.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    {g.pnlPercent.toFixed(1)}%
                  </td>
                  <td className={`text-right ${g.realized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
                    <Money value={g.realized} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Breakdowns ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BreakdownCard title="By account / wallet" rows={a.byAccount} donut />
        <BreakdownCard title="By asset type" rows={a.byAssetType} translate donut />
        <BreakdownCard title="By risk level" rows={a.byRisk} translate colorByRisk />
        <BreakdownCard title="By time horizon" rows={a.byTimeHorizon} translate />
      </div>

      {/* ---- Winners & losers ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium">Biggest gains</div>
          <div className="text-[10px] text-[var(--muted)] mb-3">
            On paper — nothing here has been sold.
          </div>
          <MoversTable rows={a.movers.winners} positive />
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium">Biggest losses</div>
          <div className="text-[10px] text-[var(--muted)] mb-3">
            On paper — a price move can take these back.
          </div>
          <MoversTable rows={a.movers.losers} />
        </div>
      </div>

      {/* ---- Full position table ---- */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-3">All positions</div>
        <div className="overflow-x-auto">
        <table className="data-table whitespace-nowrap">
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
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold truncate ${className}`}>
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
          {/* On paper. "Biggest gains" already reads like money made; without
              the qualifier the column beside it reads like money banked. */}
          <th>Unrealized P&amp;L</th>
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
