import { listAccountsWithState, createAccount, listArchivedAccounts, unarchiveAccount } from "@/actions/accounts";
import { getAccountPlatformTotals } from "@/actions/connections";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

const STATE_COLOR: Record<string, string> = {
  RECONCILED: "text-[var(--green)]",
  STALE: "text-[var(--amber)]",
  OVERALLOCATED: "text-[var(--red)]",
};

export default async function AccountsPage() {
  const [accounts, archived, platformTotals] = await Promise.all([
    listAccountsWithState(),
    listArchivedAccounts(),
    getAccountPlatformTotals(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Accounts</h1>

      <div className="card p-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>Institution</th>
              <th>Name</th>
              <th>Balance</th>
              <th>Allocated</th>
              <th>Free</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.institution}</td>
                <td>
                  <Link href={`/accounts/${a.id}`} className="hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td>
                  {(() => {
                    const p = platformTotals.get(a.id);
                    const shown = p ? p.total : a.balance;
                    return (
                      <>
                        <Money value={shown} currency={a.currency} />
                        {p && p.unrealizedPnl !== 0 && (
                          <span
                            className={
                              p.unrealizedPnl > 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                            }
                          >
                            {" "}
                            ({p.unrealizedPnl > 0 ? "+" : "−"}
                            {Math.abs(p.unrealizedPnl).toFixed(2)})
                          </span>
                        )}
                        {p && p.spot > 0 && (
                          <div className="text-[10px] text-[var(--muted)]">
                            {p.equity.toFixed(2)} perps + {p.spot.toFixed(2)} spot
                          </div>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td>
                  <Money value={a.allocated} currency={a.currency} />
                </td>
                <td>
                  <Money value={a.free} currency={a.currency} />
                </td>
                <td className={STATE_COLOR[a.state]}>{a.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Add account</div>
        <form action={createAccount} className="space-y-3">
          <input name="institution" placeholder="Institution (e.g. Trade Republic)" className="input" required />
          <input name="name" placeholder="Name (e.g. TR Cash)" className="input" required />
          <select name="accountType" className="input">
            <option value="bank">Bank</option>
            <option value="broker">Broker</option>
            <option value="exchange">Exchange</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
          <div className="flex gap-2">
            <select name="currency" className="input">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
            <input name="balance" type="number" step="0.01" placeholder="Starting balance" className="input" />
          </div>
          <button type="submit" className="btn w-full">
            Add
          </button>
        </form>
      </div>

      {archived.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3 text-[var(--muted)]">Archived accounts</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Name</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {archived.map((a) => (
                <tr key={a.id}>
                  <td>{a.institution}</td>
                  <td>{a.name}</td>
                  <td>
                    <Money value={Number(a.balance)} currency={a.currency} />
                  </td>
                  <td>
                    <form action={unarchiveAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                        Unarchive
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
