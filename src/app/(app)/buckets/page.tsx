import { listBucketsWithTotals, createBucket } from "@/actions/buckets";
import { Money } from "@/components/PrivacyContext";

export default async function BucketsPage() {
  const buckets = await listBucketsWithTotals();

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Buckets</h1>

      <div className="grid grid-cols-2 gap-4">
        {buckets.map((b) => {
          const target = b.targetAmount ? Number(b.targetAmount) : null;
          const pct = target ? Math.min(100, Math.round((b.total / target) * 100)) : null;
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">{b.name}</div>
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
