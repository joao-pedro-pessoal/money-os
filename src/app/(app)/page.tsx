import { listAccountsWithState } from "@/actions/accounts";
import { listTransactions } from "@/actions/transactions";
import { getPortfolioContribution } from "@/actions/investments";
import { netWorth } from "@/lib/accounting";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function DashboardPage() {
  const accounts = await listAccountsWithState();
  const recentTx = await listTransactions(8);
  const portfolio = await getPortfolioContribution();

  // Account balances are cash only; positions are tracked separately in
  // /investments and added on top, so the two never overlap.
  const cash = netWorth(accounts.map((a) => ({ id: a.id, balance: a.balance })));
  const nw = Math.round((cash + portfolio.portfolioValue + Number.EPSILON) * 100) / 100;
  const totalFree = accounts.reduce((s, a) => s + a.free, 0);
  const totalAllocated = accounts.reduce((s, a) => s + a.allocated, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTx = recentTx.filter((t) => new Date(t.date) >= monthStart);
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const warnings = accounts.filter((a) => a.state !== "RECONCILED");

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Net Worth" value={nw} floating={portfolio.floating} />
        <StatCard label="Free Cash" value={totalFree} />
        <StatCard label="Allocated Cash" value={totalAllocated} />
        <StatCard label="Net Cash Flow (month)" value={income - expenses} />
      </div>

      {warnings.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">Attention</div>
          {warnings.map((a) => (
            <div key={a.id} className="text-sm text-[var(--muted)] flex items-center justify-between">
              <span>
                {a.state === "OVERALLOCATED" ? "⚠️" : "🕒"} {a.name} — {a.state === "OVERALLOCATED" ? `overallocated by €${a.overallocatedBy.toFixed(2)}` : "balance is stale"}
              </span>
              <Link href={`/accounts/${a.id}`} className="text-[var(--accent)] text-xs">
                Reconcile
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Accounts</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Balance</th>
                <th>Free</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/accounts/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>
                    <Money value={a.balance} currency={a.currency} />
                  </td>
                  <td>
                    <Money value={a.free} currency={a.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Recent Transactions</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleDateString("pt-PT")}</td>
                  <td>{t.description || t.categoryName || t.type}</td>
                  <td>
                    <Money value={Number(t.amount)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * `floating` is the market-exposed slice of the value — shown in parentheses so
 * the headline number never hides how much of it isn't guaranteed.
 */
function StatCard({ label, value, floating }: { label: string; value: number; floating?: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-xl font-semibold">
        <Money value={value} />
        {floating !== undefined && floating > 0 && (
          <span className="text-sm font-normal text-[var(--amber)]">
            {" "}
            (<Money value={floating} />)
          </span>
        )}
      </div>
      {floating !== undefined && floating > 0 && (
        <div className="text-[10px] text-[var(--muted)] mt-1">in parentheses: not guaranteed</div>
      )}
    </div>
  );
}
