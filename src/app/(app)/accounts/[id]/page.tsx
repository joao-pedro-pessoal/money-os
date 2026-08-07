import { getAccount, getAccountSnapshots, updateAccountBalance } from "@/actions/accounts";
import { listBucketsWithTotals, setAllocation } from "@/actions/buckets";
import { Money } from "@/components/PrivacyContext";
import { notFound } from "next/navigation";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const snapshots = await getAccountSnapshots(id);
  const buckets = await listBucketsWithTotals();
  const myAllocations = buckets.flatMap((b) =>
    b.allocations.filter((a) => a.accountId === id).map((a) => ({ ...a, bucketName: b.name }))
  );

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs text-[var(--muted)]">{account.institution}</div>
        <h1 className="text-lg font-semibold">{account.name}</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Current Balance</div>
          <div className="text-xl font-semibold">
            <Money value={Number(account.balance)} currency={account.currency} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Last Updated</div>
          <div className="text-sm">
            {account.lastManualUpdate ? new Date(account.lastManualUpdate).toLocaleString("pt-PT") : "never"}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">History points</div>
          <div className="text-sm">{snapshots.length} snapshots</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Update balance (reconciliation)</div>
          <form action={updateAccountBalance} className="space-y-3">
            <input type="hidden" name="accountId" value={account.id} />
            <input name="newBalance" type="number" step="0.01" placeholder="New real balance" className="input" required />
            <select name="classification" className="input">
              <option value="interest">Interest</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="correction">Correction</option>
              <option value="other">Other</option>
            </select>
            <button type="submit" className="btn w-full">
              Save
            </button>
            <p className="text-xs text-[var(--muted)]">
              The difference vs. the current balance is logged to the audit log with this classification.
            </p>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Bucket allocations</div>
          <table className="data-table mb-4">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {myAllocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.bucketName}</td>
                  <td>
                    <Money value={a.amount} currency={account.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={setAllocation} className="space-y-3">
            <input type="hidden" name="accountId" value={account.id} />
            <select name="bucketId" className="input" required>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            <button type="submit" className="btn w-full">
              Set allocation
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
