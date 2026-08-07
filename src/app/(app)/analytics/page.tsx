import { getNetWorthOverTime, getMoneyByLocation } from "@/actions/analytics";
import { listBucketsWithTotals } from "@/actions/buckets";
import { listAccountsWithState } from "@/actions/accounts";
import DonutChart from "@/components/DonutChart";
import NetWorthChart from "@/components/NetWorthChart";

export default async function AnalyticsPage() {
  const [netWorthSeries, byLocation, buckets, accounts] = await Promise.all([
    getNetWorthOverTime(),
    getMoneyByLocation(),
    listBucketsWithTotals(),
    listAccountsWithState(),
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
        <div className="text-sm font-medium mb-3">Net worth over time</div>
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
