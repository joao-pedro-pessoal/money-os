import { getSpendingAnalysis } from "@/actions/spending";
import PageTabs from "@/components/PageTabs";
import { ANALYTICS_TABS } from "@/lib/navigation";
import SpendingAnalysis from "@/components/SpendingAnalysis";

/**
 * Where the money goes.
 *
 * The counterpart to the investment analysis: same idea, other half of the app.
 * Everything is computed from recorded transactions and nothing is estimated —
 * which is why the empty state points at the importer rather than showing a
 * demo.
 */
export default async function SpendingPage() {
  const data = await getSpendingAnalysis();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Analytics</h1>
      <PageTabs tabs={ANALYTICS_TABS} />
      <p className="text-xs text-[var(--muted)]">
        Every figure here comes from transactions you recorded. Transfers between your own
        accounts are never counted as spending — moving money is not losing it.
      </p>

      <SpendingAnalysis
        rows={data.rows}
        options={data.options}
        currency={data.baseCurrency}
        unconverted={data.unconverted}
        approximate={data.approximate}
      />
    </div>
  );
}
