import { getTotalNetWorthOverTime, getMoneyByLocation } from "@/actions/analytics";
import { getPortfolioContribution } from "@/actions/investments";
import { listBucketsWithTotals } from "@/actions/buckets";
import { listBudgets } from "@/actions/budgets";
import { listAccountsWithState } from "@/actions/accounts";
import { getRates } from "@/actions/fx";
import { toBase } from "@/lib/fx";
import { splitPortfolioCash } from "@/lib/accounting/unallocated";
import { purposeSplit } from "@/lib/accounting/networth";
import { getNetWorth } from "@/actions/networth";
import CompositionCard, { BudgetBars } from "@/components/CompositionCard";
import TimeSeriesCard from "@/components/TimeSeriesCard";
import { getBaseCurrency } from "@/actions/settings";
import PageTabs from "@/components/PageTabs";
import { ANALYTICS_TABS } from "@/lib/navigation";

export default async function AnalyticsPage() {
  const [netWorthSeries, byLocation, buckets, portfolio, budgets, netWorth, accounts, rates, baseCurrency] =
    await Promise.all([
      getTotalNetWorthOverTime(),
      getMoneyByLocation(),
      listBucketsWithTotals(),
      getPortfolioContribution(),
      listBudgets(),
      getNetWorth(),
      listAccountsWithState(),
      getRates(),
      getBaseCurrency(),
    ]);

  const approximatePoints = netWorthSeries.filter((p) => p.approximate).length;

  /**
   * Purpose covers everything you own, and adds up to exactly that.
   *
   * The arithmetic lives in `purposeSplit`, beside the net worth definition it
   * has to agree with — an earlier version assembled it here from overlapping
   * pieces and reported 880 € against a net worth of 694 €.
   */
  const investingCash = accounts.reduce(
    (sum, a) =>
      sum +
      (toBase(
        splitPortfolioCash(a.free, a.portfolioCashPercent === null ? null : Number(a.portfolioCashPercent))
          .belongsToPortfolio,
        a.currency,
        rates,
        baseCurrency
      ) ?? 0),
    0
  );

  const purpose = purposeSplit({
    result: netWorth,
    investingCash,
    promisedToBuckets: buckets.reduce((s, b) => s + b.total, 0),
  });

  const byPurpose = [
    { name: "Invested", value: purpose.invested },
    { name: "Waiting to invest", value: purpose.waitingToInvest },
    { name: "Promised to a bucket", value: purpose.promised },
    { name: "Free to spend", value: purpose.free },
  ].filter((p) => p.value > 0);

  /** Guaranteed against at-risk: the split that decides how you should feel. */
  const bySafety = [
    ...(netWorth.guaranteed > 0 ? [{ name: "Capital-guaranteed", value: netWorth.guaranteed }] : []),
    ...(netWorth.floating > 0 ? [{ name: "Can move with the market", value: netWorth.floating }] : []),
  ];

  const budgetItems = budgets.items.map((b) => ({
    id: b.id,
    name: b.name,
    limit: b.limit,
    spent: b.spent,
    remaining: b.remaining,
    percent: b.percent,
    status: b.status,
    pacingOver: b.pacingOver,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <PageTabs tabs={ANALYTICS_TABS} />

      <TimeSeriesCard
        title="Net worth over time"
        series={netWorthSeries.map((p) => ({ date: p.date, value: p.netWorth }))}
        currency={baseCurrency}
        action={
          portfolio.floating > 0 ? (
            <span className="text-xs text-[var(--muted)]">
              includes investments · not guaranteed:{" "}
              <span className="text-[var(--amber)]">
                {portfolio.floating.toFixed(2)} {baseCurrency}
              </span>
            </span>
          ) : undefined
        }
        note={
          <>
            Each dot is a day your balances were actually recorded; the lines between them are
            straight because nothing was measured in between.
            {approximatePoints > 0 && (
              <span className="text-[var(--amber)]">
                {" "}
                {approximatePoints} of {netWorthSeries.length} points predate exchange rates being
                stored with each snapshot, so they use today&apos;s rate rather than the rate of
                their own day.
              </span>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompositionCard
          title="Money by location"
          data={byLocation}
          currency={baseCurrency}
          note="Where the money sits, each account once at its full value, converted to one currency. Investments included, so this matches your net worth."
        />
        <CompositionCard
          title="Money by purpose"
          data={byPurpose}
          currency={baseCurrency}
          note="What the money is for — these add up to your net worth exactly. Waiting to invest is stablecoins plus the idle cash you have marked as investing money: you still have it, it just is not spending money."
        />
        <CompositionCard
          title="Guaranteed or at risk"
          data={bySafety}
          currency={baseCurrency}
          defaultShape="bars"
          note="The same total, split by whether it can fall. Cash and stablecoins on one side, anything priced by a market on the other."
        />

        <div className="card p-4">
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <div className="text-sm font-medium">Budgets this period</div>
            {budgets.overCount > 0 && (
              <span className="text-[10px]" style={{ color: "var(--red)" }}>
                {budgets.overCount} over
              </span>
            )}
          </div>
          <BudgetBars items={budgetItems} currency={budgets.baseCurrency} />
          <div className="text-[10px] text-[var(--muted)] mt-3 leading-snug">
            Amber means you are inside the limit but spending faster than the period is passing —
            on track to go over without being over yet.
          </div>
        </div>
      </div>
    </div>
  );
}
