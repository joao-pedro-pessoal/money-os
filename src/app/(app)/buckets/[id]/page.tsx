import { getBucket, listBucketsWithTotals, updateBucket, deleteBucket, setAllocation } from "@/actions/buckets";
import { listAccountsWithState } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { notFound } from "next/navigation";

export default async function BucketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bucket = await getBucket(id);
  if (!bucket) notFound();

  const [allBuckets, accounts] = await Promise.all([listBucketsWithTotals(), listAccountsWithState()]);
  const withTotals = allBuckets.find((b) => b.id === id)!;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{bucket.name}</h1>
        <form action={deleteBucket}>
          <input type="hidden" name="id" value={bucket.id} />
          <ConfirmSubmitButton
            label="Delete bucket"
            confirmMessage={`Delete "${bucket.name}"? Its allocations are removed too — that money becomes Free Cash again.`}
          />
        </form>
      </div>

      <div className="card p-4">
        <div className="text-xs text-[var(--muted)] mb-1">Total allocated</div>
        <div className="text-xl font-semibold">
          <Money value={withTotals.total} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Edit bucket</div>
          <form action={updateBucket} className="space-y-3">
            <input type="hidden" name="id" value={bucket.id} />
            <input name="name" defaultValue={bucket.name} className="input" required />
            <textarea name="description" defaultValue={bucket.description ?? ""} className="input" rows={2} />
            <input name="targetAmount" type="number" step="0.01" defaultValue={bucket.targetAmount ?? ""} placeholder="Target amount" className="input" />
            <input name="color" type="color" defaultValue={bucket.color ?? "#6366f1"} className="input h-10" />
            <button type="submit" className="btn w-full">
              Save
            </button>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Allocations by account</div>
          <table className="data-table mb-4">
            <thead>
              <tr>
                <th>Account</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {withTotals.allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.accountName}</td>
                  <td>
                    <Money value={a.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={setAllocation} className="space-y-3">
            <input type="hidden" name="bucketId" value={bucket.id} />
            <select name="accountId" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
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
    </div>
  );
}
