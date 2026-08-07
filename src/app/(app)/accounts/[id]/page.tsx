import { getAccount, getAccountSnapshots, updateAccountBalance, updateAccount, archiveAccount } from "@/actions/accounts";
import { listBucketsWithTotals, setAllocation } from "@/actions/buckets";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-[var(--muted)]">{account.institution}</div>
          <h1 className="text-lg font-semibold">{account.name}</h1>
        </div>
        <form action={archiveAccount}>
          <input type="hidden" name="id" value={account.id} />
          <ConfirmSubmitButton
            label={account.active ? "Archive account" : "Account archived"}
            confirmMessage={`Archive "${account.name}"? Its history stays intact, it just leaves the active lists.`}
          />
        </form>
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
              <option value="correction">Correction (no cash-flow impact)</option>
              <option value="other">Other (no cash-flow impact)</option>
            </select>
            <button type="submit" className="btn w-full">
              Save
            </button>
            <p className="text-xs text-[var(--muted)]">
              The difference vs. the current balance is recorded as a transaction of this type (except
              Correction/Other, which just fixes the number without affecting cash flow).
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
            <input name="amount" type="number" step="0.01" placeholder="Amount (0 removes it)" className="input" required />
            <button type="submit" className="btn w-full">
              Set allocation
            </button>
          </form>
        </div>
      </div>

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-3">Edit account details</div>
        <form action={updateAccount} className="space-y-3">
          <input type="hidden" name="id" value={account.id} />
          <input name="institution" defaultValue={account.institution} className="input" required />
          <input name="name" defaultValue={account.name} className="input" required />
          <select name="accountType" defaultValue={account.accountType} className="input">
            <option value="bank">Bank</option>
            <option value="broker">Broker</option>
            <option value="exchange">Exchange</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
          <select name="currency" defaultValue={account.currency} className="input">
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          <textarea name="notes" defaultValue={account.notes ?? ""} placeholder="Notes" className="input" rows={2} />
          <button type="submit" className="btn w-full">
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}
