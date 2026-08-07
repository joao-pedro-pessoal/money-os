import { listAccountsWithState, createAccount } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

const STATE_COLOR: Record<string, string> = {
  RECONCILED: "text-[var(--green)]",
  STALE: "text-[var(--amber)]",
  OVERALLOCATED: "text-[var(--red)]",
};

export default async function AccountsPage() {
  const accounts = await listAccountsWithState();

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
                  <Money value={a.balance} currency={a.currency} />
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
    </div>
  );
}
