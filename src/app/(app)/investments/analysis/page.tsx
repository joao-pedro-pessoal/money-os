import {
  getPortfolioAnalysis,
  getGroupedPerformance,
  getPortfolioReturns,
} from "@/actions/investments";
import PortfolioReturns from "@/components/PortfolioReturns";
import { Money } from "@/components/PrivacyContext";
import DonutChart from "@/components/DonutChart";
import { tagLabel, type TagAxis, riskColor } from "@/lib/portfolio/tags";
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
import { Fragment } from "react";

export default async function PortfolioAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{
    groupBy?: string;
    sort?: string;
    dir?: string;
    synced?: string;
    open?: string;
  }>;
}) {
  const sp = await searchParams;
  const groupBy = (GROUP_BY_OPTIONS.find((o) => o.value === sp.groupBy)?.value ?? "playlist") as GroupByKey;
  const sort = (SORT_COLUMNS.find((c) => c.key === sp.sort)?.key ?? "value") as SortKey;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  // Spot/stablecoins count by default; "off" narrows the view to at-risk positions.
  const includeSynced = sp.synced !== "off";
  /**
   * Which group is opened, in the URL rather than in component state.
   *
   * This page is a server component and already builds query strings for
   * grouping and sorting, so a disclosure is one more parameter rather than a
   * reason to move the whole table to the client — and the opened view is a
   * link you can come back to.
   */
  const openGroup = sp.open ?? null;

  const statement = await getStatementBreakdown();
  const a = await getPortfolioAnalysis(includeSynced);
  const returns = await getPortfolioReturns();
  const grouped = await getGroupedPerformance(groupBy, sort, dir, includeSynced);
  const groupLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)!.label;
  const best = [...grouped].filter((g) => g.cost > 0).sort((x, y) => y.pnlPercent - x.pnlPercent)[0];
  const translateKeys = groupBy !== "playlist" && groupBy !== "account" && groupBy !== "symbol";
  /**
   * Which vocabulary this grouping is drawn from.
   *
   * Without it `long` on a horizon chart resolved to "Long (gains when it
   * rises)" and `low` on a risk chart to "Low liquidity" — five values mean
   * different things on different axes, and a label that does not know the
   * axis picks whichever list was flattened in last.
   */
  const groupAxis: TagAxis | undefined =
    groupBy === "riskLevel"
      ? "risk"
      : groupBy === "timeHorizon"
        ? "timeHorizon"
        : groupBy === "liquidity"
          ? "liquidity"
          : groupBy === "expectedReturn"
            ? "expectedReturn"
            : groupBy === "assetType"
              ? "assetType"
              : undefined;
  const label = (k: string) => (translateKeys ? tagLabel(k, groupAxis) ?? k : k);
  const qs = (over: Record<string, string>) =>
    "?" +
    new URLSearchParams({
      groupBy,
      sort,
      dir,
      synced: includeSynced ? "on" : "off",
      ...(openGroup === null ? {} : { open: openGroup }),
      ...over,
    }).toString();
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

      {/* How much of the portfolio the breakdowns above actually describe.
          Every one of them files an unset axis under "unset", which reads as a
          category rather than as an admission — so this says it plainly, and
          says which positions to fix first. */}
      {a.tagging.positions > 0 && a.needsTags.length > 0 && (
        <section className="card p-4" style={{ borderLeft: "2px solid var(--amber)" }}>
          <div className="text-sm font-medium">
            {a.tagging.complete === 0
              ? "None of these positions is fully classified"
              : `${a.needsTags.length} of ${a.tagging.positions} positions are not fully classified`}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl leading-relaxed">
            The breakdowns above group anything unanswered under <em>unset</em>, so where that
            slice is large they are mostly drawing the absence of an answer.{" "}
            <Money value={a.tagging.incompleteValue} currency="EUR" /> sits in positions missing
            at least one axis.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {a.coverage.map((c) => (
              <div key={c.axis}>
                <div className="text-[10px] text-[var(--muted)] uppercase tracking-wide">
                  {c.label}
                </div>
                <div
                  className="text-lg font-semibold"
                  style={{
                    color:
                      c.coverage === null
                        ? "var(--muted)"
                        : c.coverage === 0
                          ? "var(--red)"
                          : c.coverage < 50
                            ? "var(--amber)"
                            : "var(--green)",
                  }}
                >
                  {/* Null, not 0%: a percentage of an empty portfolio is a
                      question with no answer. */}
                  {c.coverage === null ? "—" : `${c.coverage.toFixed(0)}%`}
                </div>
                <div className="text-[10px] text-[var(--muted)]">
                  {c.untagged === 0
                    ? "every position answered"
                    : `${c.untagged} unanswered · ${c.untaggedValue.toFixed(2)} EUR`}
                </div>
              </div>
            ))}
          </div>

          {/* Ordered by money: classifying the largest holding moves every
              breakdown on the page, and classifying the smallest moves none. */}
          <div className="overflow-auto max-h-72 mt-4">
            <table className="data-table whitespace-nowrap text-xs w-full">
              <thead>
                <tr>
                  <th>Position</th>
                  <th className="text-right">Value</th>
                  <th>Still to answer</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {a.needsTags.map((g) => (
                  <tr key={g.symbol}>
                    <td className="max-w-64 truncate">{g.symbol}</td>
                    <td className="text-right">
                      <Money value={g.value} currency="EUR" />
                    </td>
                    <td className="text-[var(--amber)]">
                      {g.missing.map((m) => m.label).join(", ")}
                    </td>
                    <td className="text-right">
                      <Link href="/positions" className="text-[var(--accent)]">
                        tag →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

      {/*
        How the investing has gone, before anything about what it holds.
        Profit against cost is below; these two are what a return actually
        means once money has moved in and out.
      */}
      <PortfolioReturns
        timeWeighted={returns.timeWeighted}
        moneyWeighted={returns.moneyWeighted}
        withheld={returns.withheld}
        coverage={returns.coverage}
        netContributed={returns.netContributed}
        currentValue={returns.currentValue}
        currency={returns.baseCurrency}
      />

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
              {tagLabel(m.riskLevel, "risk")?.toLowerCase()} — money you may need soon sitting in a volatile position.
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
                <Fragment key={g.key}>
                <tr>
                  <td>
                    {/* Opening a group is a link, so the view survives a
                        refresh and can be sent to someone. */}
                    <Link
                      href={qs({ open: openGroup === g.key ? "" : g.key })}
                      className="hover:underline"
                      style={groupBy === "riskLevel" ? { color: riskColor(g.key) } : undefined}
                    >
                      {openGroup === g.key ? "▾ " : "▸ "}
                      {label(g.key)}
                    </Link>
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

                {/* What the group is made of. These are the very rows the
                    totals above were summed from, so the detail cannot
                    disagree with the line it sits under. */}
                {openGroup === g.key && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--surface-2)" }}>
                      <table className="data-table text-xs w-full">
                        <thead>
                          <tr>
                            <th>Position</th>
                            <th className="text-right">Weight in group</th>
                            <th className="text-right">Value</th>
                            <th className="text-right">Cost</th>
                            <th className="text-right">Unrealized</th>
                            <th className="text-right">Unrealized %</th>
                            <th className="text-right">Realized</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.members.map((m) => (
                            <tr key={m.symbol}>
                              <td className="max-w-64 truncate">{m.symbol}</td>
                              <td className="text-right">{m.shareOfGroup.toFixed(1)}%</td>
                              <td className="text-right">
                                <Money value={m.value} />
                              </td>
                              <td className="text-right">
                                <Money value={m.cost} />
                              </td>
                              <td
                                className={`text-right ${m.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                              >
                                <Money value={m.pnl} />
                              </td>
                              <td
                                className={`text-right ${m.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                              >
                                {m.pnlPercent.toFixed(1)}%
                              </td>
                              <td
                                className={`text-right ${m.realized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                              >
                                <Money value={m.realized} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* An instrument sold to nothing has no position left,
                          so nothing records which group it belonged to. Its
                          closed trades are in the history and cannot be shown
                          here — said plainly rather than left as an absence
                          that reads like "you never traded any". */}
                      <p className="text-[10px] text-[var(--muted)] mt-2 leading-relaxed">
                        These are the positions still open in this group. An instrument you have
                        sold entirely keeps no risk or horizon tag, so its closed trades cannot be
                        placed in a group — they are on the{" "}
                        <Link href="/investments/history" className="text-[var(--accent)]">
                          history
                        </Link>
                        , where realised results are listed per instrument.
                      </p>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Breakdowns ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BreakdownCard title="By account / wallet" rows={a.byAccount} donut />
        <BreakdownCard title="By asset type" rows={a.byAssetType} axis="assetType" translate donut />
        <BreakdownCard title="By risk level" rows={a.byRisk} axis="risk" translate colorByRisk />
        <BreakdownCard title="By time horizon" rows={a.byTimeHorizon} axis="timeHorizon" translate />
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
                <td>{tagLabel(h.assetType, "assetType") ?? "—"}</td>
                <td style={{ color: riskColor(h.riskLevel) }}>{tagLabel(h.riskLevel, "risk") ?? "—"}</td>
                <td>{tagLabel(h.timeHorizon, "timeHorizon") ?? "—"}</td>
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
  axis,
  donut = false,
  colorByRisk = false,
}: {
  title: string;
  rows: Breakdown[];
  translate?: boolean;
  /** Which vocabulary the keys come from, so a shared value is labelled right. */
  axis?: TagAxis;
  donut?: boolean;
  colorByRisk?: boolean;
}) {
  const label = (key: string) => (translate ? tagLabel(key, axis) ?? key : key);

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
