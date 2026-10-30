import Link from "next/link";
import { textForRequest } from "@/actions/pageLanguage";
import { getNetWorth } from "@/actions/networth";
import { getMonthShape } from "@/actions/dashboard";
import { listAccountsWithState } from "@/actions/accounts";
import { listBudgets } from "@/actions/budgets";
import { listBucketsWithTotals } from "@/actions/buckets";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { getDueSubscriptionCharges } from "@/actions/subscriptionCharges";
import { Money } from "./PrivacyContext";
import NetWorthChart from "./NetWorthChart";
import DueSubscriptionCharges from "./DueSubscriptionCharges";
import PageTabs from "./PageTabs";
import { ANALYTICS_TABS } from "@/lib/navigation";
import Section from "./Section";

/** Everyday money, using the same totals as the full edition. Never rewrites old data. */
export default async function MoneyOverview({ analytics = false }: { analytics?: boolean }) {
  const t = await textForRequest();
  const [worth, month, accounts, budgets, goals, series, due] = await Promise.all([
    getNetWorth(), getMonthShape(), listAccountsWithState(), listBudgets(),
    listBucketsWithTotals(), getTotalNetWorthOverTime(), getDueSubscriptionCharges(),
  ]);
  const currency = worth.baseCurrency;
  const cards = [
    { label: "Net worth", value: worth.total },
    { label: "Income", value: month.flows.income.total },
    { label: "Expenses", value: month.flows.expenses.total },
    { label: "This month", value: month.flows.income.total - month.flows.expenses.total },
  ];
  return <div className="space-y-6">
    <h1 className="text-lg font-semibold">{t(analytics ? "Analytics" : "Dashboard")}</h1>
    {analytics && <PageTabs tabs={ANALYTICS_TABS} />}
    {worth.unconverted.length > 0 && <p role="status" className="card p-3 text-sm text-[var(--amber)]">{t("Some amounts could not be converted to ")}{currency}. {t("Add a rate in Settings.")}</p>}
    <p className="text-sm text-[var(--muted)]">{t("Income and expenses for the current month.")}</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => <div key={card.label} className="card p-4 min-w-0">
        <div className="text-xs text-[var(--muted)] mb-2">{t(card.label)}</div>
        <div className="text-xl font-semibold"><Money value={card.value} currency={currency} /></div>
        {card.label === "Net worth" && worth.portfolio > 0 && <p className="text-xs text-[var(--muted)] mt-2">{t("Includes previously recorded assets. Their records remain in your full backup.")}</p>}
        {card.label === "Net worth" && worth.liabilities > 0 && <Link href="/liabilities" className="text-xs text-[var(--accent)] mt-2 block">{t("What you owe")}: <Money value={worth.liabilities} currency={currency} /></Link>}
      </div>)}
    </div>
    <DueSubscriptionCharges charges={due.charges} accounts={due.accounts} compact />
    <div className="flex flex-wrap gap-2">
      {[{href:"/accounts",label:"Accounts"},{href:"/transactions",label:"Cash Flow"},{href:"/import",label:"Import statement"},{href:"/analytics/report",label:"Reports"}].map(link => <Link key={link.href} href={link.href} className="inline-flex items-center min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--accent)]">{t(link.label)}</Link>)}
    </div>
    <Section title="Accounts" defaultOpen essential>
      {accounts.length === 0 ? <Link href="/accounts" className="btn">{t("Add account by hand")}</Link> : <ul className="divide-y divide-[var(--border)]">
        {accounts.map(account => <li key={account.id}>
          <Link href={`/accounts/${account.id}`} className="flex justify-between gap-3 py-3 min-h-11">
            <span translate="no">{account.name}</span><Money value={account.balance} currency={account.currency} />
          </Link>
        </li>)}
      </ul>}
    </Section>
    <Section title="Budgets" defaultOpen essential>
      <ul className="space-y-3">{budgets.items.map(budget => <li key={budget.id} className="flex justify-between gap-3 flex-wrap">
        <Link href="/budgets" className="hover:underline" translate="no">{budget.name}</Link>
        <span><Money value={budget.spent} currency={currency} /> / <Money value={budget.limit} currency={currency} /></span>
      </li>)}</ul>
      <Link href="/budgets" className="inline-block mt-3 text-[var(--accent)]">{t("New budget")}</Link>
    </Section>
    <Section title="Buckets" defaultOpen essential>
      <ul className="space-y-3">{goals.map(goal => <li key={goal.id} className="flex justify-between gap-3 flex-wrap">
        <Link href={`/buckets/${goal.id}`} className="hover:underline" translate="no">{goal.name}</Link>
        <Money value={goal.total} currency={currency} />
      </li>)}</ul>
      <Link href="/buckets" className="inline-block mt-3 text-[var(--accent)]">{t("Create bucket")}</Link>
    </Section>
    <Section title="Net worth over time" defaultOpen={analytics} essential={analytics}>
      {series.some(point => point.approximate) && <p className="text-xs text-[var(--muted)] mb-3">{t("Historical values are approximate.")}</p>}
      <NetWorthChart data={series.map(point => ({ date:point.date, netWorth:point.netWorth }))} currency={currency} />
    </Section>
  </div>;
}
