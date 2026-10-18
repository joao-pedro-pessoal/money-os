import { textForRequest } from "@/actions/pageLanguage";
import Link from 'next/link';
import { getSavingsData } from '@/actions/savings';
import SavingsDashboard from '@/components/SavingsDashboard';

export default async function SavingsPage({ searchParams }: { searchParams: Promise<{ purchase?: string }> }) {
  const uiText = await textForRequest();
  const [data, query] = await Promise.all([getSavingsData(), searchParams]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-lg font-semibold">{uiText("Savings")}</h1><Link className="btn" href="/transactions">{uiText("Cash Flow")}</Link></div>
    <p className="text-sm text-[var(--muted)]">{uiText("Discounts and cashback from your purchases. Pending cashback is separate. Savings here measure purchase benefits, not available cash or money assigned to buckets.")}</p>
    <SavingsDashboard data={data} initialPurchase={query.purchase} />
  </div>;
}
