import { listBucketsWithTotals, createBucket, addToAllocation } from "@/actions/buckets";
import { listAccountsWithState } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function BucketsPage() {
  const [buckets, accounts] = await Promise.all([listBucketsWithTotals(), listAccountsWithState()]);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Buckets</h1>

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-1">Add money to a bucket</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Move some of an account's free cash into a bucket. This doesn't move real money — it just marks it as
          reserved for that purpose.
        </p>
        {buckets.length === 0 || accounts.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            {accounts.length === 0 ? "Create an account first." : "Create a bucket below first."}
          </p>
        ) : (
          <form action={addToAllocation} className="space-y-3">
            <select name="accountId" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — free: {a.free.toFixed(2)} {a.currency}
                </option>
              ))}
            </select>
            <select name="bucketId" className="input" required>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            <button type="submit" className="btn w-full">
              Add to bucket
            </button>

          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {buckets.map((b) => {
          const target = b.targetAmount ? Number(b.targetAmount) : null;
          const pct = target ? Math.min(100, Math.round((b.total / target) * 100)) : null;
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <Link href={`/buckets/${b.id}`} className="text-sm font-medium hover:underline">{b.name}</Link>
                <div className="text-sm">
                  <Money value={b.total} />
                  {target ? <span className="text-[var(--muted)]"> / <Money value={target} /></span> : null}
                </div>
              </div>
              {pct !== null && (
                <div className="h-1.5 rounded-full bg-[var(--surface-2)] mb-3 overflow-hidden">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="space-y-1">
                {b.allocations.map((a) => (
                  <div key={a.id} className="flex justify-between text-xs text-[var(--muted)]">
                    <span>{a.accountName}</span>
                    <Money value={a.amount} />
                  </div>
                ))}
                {b.allocations.length === 0 && (
                  <div className="text-xs text-[var(--muted)]">No money allocated yet.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Create bucket</div>
        <form action={createBucket} className="space-y-3">
          <input name="name" placeholder="Name (e.g. Emergency Fund)" className="input" required />
          <input name="description" placeholder="Description" className="input" />
          <input name="targetAmount" type="number" step="0.01" placeholder="Target amount (optional)" className="input" />
          <button type="submit" className="btn w-full">
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
