import { listAccountsWithState } from "@/actions/accounts";
import { listTransactions } from "@/actions/transactions";
import { getNetWorth } from "@/actions/networth";
import { getAccountPlatformTotals } from "@/actions/connections";
import { getRates } from "@/actions/fx";
import { getBaseCurrency } from "@/actions/settings";
import { sumInBase, toBase } from "@/lib/fx";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function DashboardPage() {
  const accounts = await listAccountsWithState();
  const recentTx = await listTransactions(8);
  // Every money total on this page comes from one place — see
  // src/lib/accounting/networth.ts for why.
  const nw = await getNetWorth();
  const rates = await getRates();
  const base = nw.baseCurrency;
  const platformTotals = await getAccountPlatformTotals();

  const unconverted = nw.unconverted;
  const totalFree = sumInBase(
    accounts.map((a) => ({ amount: a.free, currency: a.currency })),
    rates,
    base
  ).total;
  const totalAllocated = sumInBase(
    accounts.map((a) => ({ amount: a.allocated, currency: a.currency })),
    rates,
    base
  ).total;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTx = recentTx.filter((t) => new Date(t.date) >= monthStart);
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expenses = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const warnings = accounts.filter((a) => a.state !== "RECONCILED");

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Net Worth"
          value={nw.total}
          floating={nw.floating}
          currency={base}
          note={nw.portfolio > 0 ? `cash ${fmt(nw.cash, base)} + investments ${fmt(nw.portfolio, base)}` : undefined}
        />
        <StatCard label="Investments" value={nw.portfolio} floating={nw.floating} currency={base} />
        <StatCard label="Free Cash" value={totalFree} currency={base} />
        <StatCard label="Allocated Cash" value={totalAllocated} currency={base} />
        <StatCard label="Net Cash Flow (month)" value={income - expenses} currency={base} />
      </div>

      {unconverted.length > 0 && (
        <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
          <div className="text-sm">Some balances could not be converted to EUR</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            No exchange rate for {Array.from(new Set(unconverted.map((u) => u.currency))).join(", ")}. Those
            amounts are left out of the totals above rather than counted as if they were euros. Add a rate in{" "}
            <Link href="/settings" className="text-[var(--accent)]">
              Settings
            </Link>
            .
          </div>
        </div>
      )}

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
                    {(() => {
                      const p = platformTotals.get(a.id);
                      // For a connected account, `balance` is perps equity only —
                      // show what's really on the platform (equity + spot).
                      const shown = p ? p.total : a.balance;
                      return (
                        <>
                          <Money value={shown} currency={a.currency} />
                          {p && p.unrealizedPnl !== 0 && (
                            <span
                              className={`text-sm ${
                                p.unrealizedPnl > 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                              }`}
                            >
                              {" "}
                              ({p.unrealizedPnl > 0 ? "+" : "−"}
                              {fmt(Math.abs(p.unrealizedPnl), a.currency)})
                            </span>
                          )}
                          {a.currency !== base && (
                            <div className="text-xs text-[var(--muted)]">
                              ≈ {fmt(toBase(shown, a.currency, rates, base) ?? 0, base)}
                            </div>
                          )}
                          {p && p.spot > 0 && (
                            <div className="text-[10px] text-[var(--muted)]">
                              {fmt(p.equity, a.currency)} perps + {fmt(p.spot, a.currency)} spot
                            </div>
                          )}
                        </>
                      );
                    })()}
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
/** Formats an amount for the small note lines, respecting nothing but locale. */
function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
}

function StatCard({
  label,
  value,
  floating,
  currency = "EUR",
  note,
}: {
  label: string;
  value: number;
  floating?: number;
  currency?: string;
  note?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-xl font-semibold">
        <Money value={value} currency={currency} />
        {floating !== undefined && floating > 0 && (
          <span className="text-sm font-normal text-[var(--amber)]">
            {" "}
            (<Money value={floating} currency={currency} />)
          </span>
        )}
      </div>
      {floating !== undefined && floating > 0 && (
        <div className="text-[10px] text-[var(--muted)] mt-1">in parentheses: not guaranteed</div>
      )}
      {note && <div className="text-[10px] text-[var(--muted)] mt-1">{note}</div>}
    </div>
  );
}
