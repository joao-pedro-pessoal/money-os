import { getTotalNetWorthOverTime, getMoneyByLocation } from "@/actions/analytics";
import { getPortfolioContribution } from "@/actions/investments";
import { listBucketsWithTotals } from "@/actions/buckets";
import { listAccountsWithState } from "@/actions/accounts";
import DonutChart from "@/components/DonutChart";
import NetWorthChart from "@/components/NetWorthChart";

export default async function AnalyticsPage() {
  const [netWorthSeries, byLocation, buckets, accounts, portfolio] = await Promise.all([
    getTotalNetWorthOverTime(),
    getMoneyByLocation(),
    listBucketsWithTotals(),
    listAccountsWithState(),
    getPortfolioContribution(),
  ]);

  const totalFree = accounts.reduce((s, a) => s + a.free, 0);
  const byPurpose = [
    ...buckets.filter((b) => b.total > 0).map((b) => ({ name: b.name, value: b.total })),
    ...(totalFree > 0 ? [{ name: "Free", value: totalFree }] : []),
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Analytics</h1>

      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-medium">Net worth over time</div>
          {portfolio.floating > 0 && (
            <div className="text-xs text-[var(--muted)]">
              includes investments · not guaranteed:{" "}
              <span className="text-[var(--amber)]">{portfolio.floating.toFixed(2)} €</span>
            </div>
          )}
        </div>
        <NetWorthChart data={netWorthSeries} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Money by location</div>
          <DonutChart data={byLocation} />
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Money by purpose</div>
          <DonutChart data={byPurpose} />
        </div>
      </div>
    </div>
  );
}
