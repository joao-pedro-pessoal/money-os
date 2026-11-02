import GetStarted from "./GetStarted";
import { currentUserId } from "@/actions/session";
import { listTransactions } from "@/actions/transactions";
import { currentInvestments } from "@/actions/releaseEdition";
import Link from "next/link";
import { textForRequest } from "@/actions/pageLanguage";
import { getNetWorth } from "@/actions/networth";
import { getAccountComposition, getMonthShape } from "@/actions/dashboard";
import { listAccountsWithState, listArchivedAccounts } from "@/actions/accounts";
import { listBudgets } from "@/actions/budgets";
import { listBucketsWithTotals } from "@/actions/buckets";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { getDueSubscriptionCharges } from "@/actions/subscriptionCharges";
import { listSubscriptions } from "@/actions/subscriptions";
import { listExpected } from "@/actions/expected";
import { currentLanguage } from "@/actions/language";
import { formatFor } from "@/lib/format";
import TryQuickEntry from "./TryQuickEntry";
import { Money } from "./PrivacyContext";
import NetWorthChart from "./NetWorthChart";
import DueSubscriptionCharges from "./DueSubscriptionCharges";
import PageTabs from "./PageTabs";
import { analyticsTabs } from "@/lib/navigation";
import Section from "./Section";
import DonutChart from "./DonutChart";
import ProgressBars, { budgetTone } from "./ProgressBars";
import AccountQuick from "./AccountQuick";

/** Everyday money, using the same totals as the full edition. Never rewrites old data. */
export default async function MoneyOverview({ analytics = false }: { analytics?: boolean }) {
  const investmentsEnabled = await currentInvestments();
  const t = await textForRequest();
  const [worth, month, accounts, budgets, goals, series, due, composition, subscriptions, recent, userId, coming, language] = await Promise.all([
    getNetWorth(), getMonthShape(), listAccountsWithState(), listBudgets(),
    listBucketsWithTotals(), getTotalNetWorthOverTime(), getDueSubscriptionCharges(),
    getAccountComposition(), listSubscriptions(), listTransactions(1), currentUserId(), listExpected(), currentLanguage(),
  ]);
  const { locale } = formatFor(language);
  /** Every panel opens the page it summarises. */
  const openLink = (href: string) => <Link href={href} className="text-xs text-[var(--accent)]">{t("Open →")}</Link>;
  const accountCount = accounts.length || (await listArchivedAccounts()).length;
  const activeSubscriptions = subscriptions.filter(sub => sub.active && sub.monthlyInBase !== null);
  const currency = worth.baseCurrency;
  const cards = [
    { label: "Net worth", value: worth.total, href: "/accounts" },
    { label: "Income", value: month.flows.income.total, href: "/transactions?direction=in" },
    { label: "Expenses", value: month.flows.expenses.total, href: "/analytics/spending" },
    { label: "This month", value: month.flows.income.total - month.flows.expenses.total, href: "/transactions" },
  ];
  return <div className="space-y-6">
    <h1 className="text-lg font-semibold">{t(analytics ? "Analytics" : "Dashboard")}</h1>
    {!analytics && userId && <GetStarted key={userId} userId={userId} counts={{accounts:accountCount,transactions:recent.rows.length + recent.unconverted.length,budgets:budgets.items.length,goals:goals.length}} canRecord={accounts.length>0} />}
    {analytics && <PageTabs tabs={analyticsTabs(investmentsEnabled)} />}
    {worth.unconverted.length > 0 && <p role="status" className="card p-3 text-sm text-[var(--amber)]">{t("Some amounts could not be converted to ")}{currency}. {t("Add a rate in Settings.")}</p>}
    <p className="text-sm text-[var(--muted)]">{t("Income and expenses for the current month.")}</p>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(card => <div key={card.label} className="card card-link p-4 min-w-0">
        <Link href={card.href} className="card-link-target block text-xs text-[var(--muted)] mb-2">{t(card.label)} <span aria-hidden="true">→</span></Link>
        <div className="text-xl font-semibold"><Money value={card.value} currency={currency} /></div>
        {card.label === "Net worth" && worth.portfolio > 0 && <p className="text-xs text-[var(--muted)] mt-2">{t("Includes previously recorded assets. Their records remain in your full backup.")}</p>}
        {card.label === "Net worth" && worth.liabilities > 0 && <Link href="/liabilities" className="above-card-link text-xs text-[var(--accent)] mt-2 block">{t("What you owe")}: <Money value={worth.liabilities} currency={currency} /></Link>}
      </div>)}
    </div>
    <DueSubscriptionCharges charges={due.charges} accounts={due.accounts} compact />
    <div className="flex flex-wrap gap-2">
      {accounts.length > 1 && <TryQuickEntry kind="transfer" label="Send money" className="inline-flex items-center min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--accent)]" />}
      {[{href:"/accounts",label:"Accounts"},{href:"/transactions",label:"Cash Flow"},{href:"/expected",label:"Coming in"},{href:"/import",label:"Import statement"},{href:"/analytics/report",label:"Reports"}].map(link => <Link key={link.href} href={link.href} className="inline-flex items-center min-h-11 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--accent)]">{t(link.label)}</Link>)}
    </div>
    <Section title="Accounts" defaultOpen essential summary={openLink("/accounts")}>
      {accounts.length === 0 ? <Link href="/accounts" className="btn">{t("Add account by hand")}</Link> : <>
        <DonutChart compact currency={currency} data={composition.filter(row => row.composition.total > 0).map(row => ({ name: row.name, value: row.composition.total }))} />
        <p className="text-xs text-[var(--muted)] mt-4">{t("Tap an account to set its balance or add an entry.")}</p>
        <ul className="divide-y divide-[var(--border)]">
          {accounts.map(account => <li key={account.id}>
            <AccountQuick canSend={accounts.length > 1} account={{ id: account.id, name: account.name, currency: account.currency, balance: account.balance }} className="flex w-full justify-between gap-3 py-3 min-h-11 text-left">
              <span translate="no">{account.name}</span><Money value={account.balance} currency={account.currency} />
            </AccountQuick>
          </li>)}
        </ul>
      </>}
    </Section>
    <Section title="Coming in" defaultOpen essential summary={openLink("/expected")}>
      {coming.rows.length === 0 ? <Link href="/expected" className="text-[var(--accent)]">{t("Add something coming in")}</Link> : <>
        <p className="text-xs text-[var(--muted)]">{t("Still coming, in total")}: <Money value={coming.total} currency={currency} /></p>
        <ul className="divide-y divide-[var(--border)]">
          {coming.rows.slice(0, 4).map(row => <li key={row.id}>
            <Link href="/expected" className="flex justify-between gap-3 py-3 min-h-11">
              <span className="min-w-0 truncate" translate="no">{row.name}</span>
              <span className="text-right shrink-0"><Money value={row.remaining} currency={row.currency} />{row.next && <span className={`block text-xs ${row.overdue ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>{row.next.toLocaleDateString(locale)}</span>}</span>
            </Link>
          </li>)}
        </ul>
      </>}
    </Section>
    <Section title="Budgets" defaultOpen essential summary={openLink("/budgets")}>
      <ProgressBars currency={currency} items={budgets.items.map(budget => ({ id: budget.id, name: budget.name, href: "/budgets", value: budget.spent, max: budget.available, tone: budgetTone(budget) }))} />
      <Link href="/budgets" className="inline-block mt-3 text-[var(--accent)]">{t("New budget")}</Link>
    </Section>
    <Section title="Buckets" defaultOpen essential summary={openLink("/buckets")}>
      <ProgressBars currency={currency} items={goals.map(goal => ({ id: goal.id, name: goal.name, href: `/buckets/${goal.id}`, value: goal.total, max: goal.targetAmount === null ? null : Number(goal.targetAmount) }))} />
      <Link href="/buckets" className="inline-block mt-3 text-[var(--accent)]">{t("Create bucket")}</Link>
    </Section>
    <Section title="Subscriptions" defaultOpen essential summary={openLink("/subscriptions")}>
      {activeSubscriptions.length === 0 ? <Link href="/subscriptions" className="text-[var(--accent)]">{t("Add a subscription")}</Link> : <>
        <p className="text-xs text-[var(--muted)] mb-3">{t("Committed each month")}: <Money value={activeSubscriptions.reduce((sum, sub) => sum + (sub.monthlyInBase ?? 0), 0)} currency={currency} /></p>
        <DonutChart compact currency={currency} data={activeSubscriptions.map(sub => ({ name: sub.name, value: Math.round((sub.monthlyInBase ?? 0) * 100) / 100 }))} />
        <Link href="/subscriptions" className="inline-block mt-3 text-[var(--accent)]">{t("Subscriptions")} →</Link>
      </>}
    </Section>
    <Section title="Net worth over time" defaultOpen={analytics} essential={analytics} summary={analytics ? undefined : openLink("/analytics")}>
      {series.some(point => point.approximate) && <p className="text-xs text-[var(--muted)] mb-3">{t("Historical values are approximate.")}</p>}
      <NetWorthChart data={series.map(point => ({ date:point.date, netWorth:point.netWorth }))} currency={currency} />
    </Section>
  </div>;
}
