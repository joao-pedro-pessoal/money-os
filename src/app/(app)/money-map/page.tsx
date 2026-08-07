import { listAccountsWithState } from "@/actions/accounts";
import { listBucketsWithTotals } from "@/actions/buckets";
import { getNetWorth } from "@/actions/networth";
import { Money } from "@/components/PrivacyContext";

export default async function MoneyMapPage() {
  const accounts = await listAccountsWithState();
  const buckets = await listBucketsWithTotals();

  // Single source of truth for the headline figure (src/actions/networth.ts).
  const nw = await getNetWorth();
  const total = nw.total;
  const totalFree = accounts.reduce((s, a) => s + a.free, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Money Map</h1>
        <div className="text-2xl font-semibold mt-2">
          <Money value={total} currency={nw.baseCurrency} />{" "}
          <span className="text-sm text-[var(--muted)] font-normal">total</span>
          {nw.portfolio > 0 && (
            <div className="text-xs text-[var(--muted)] font-normal mt-1">
              cash <Money value={nw.cash} currency={nw.baseCurrency} /> + investments{" "}
              <Money value={nw.portfolio} currency={nw.baseCurrency} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">By location</div>
          <div className="space-y-2">
            {accounts.map((a) => (
              <Bar key={a.id} label={a.name} value={a.balance} max={total} />
            ))}
          </div>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">By purpose</div>
          <div className="space-y-2">
            {buckets.map((b) => (
              <Bar key={b.id} label={b.name} value={b.total} max={total} />
            ))}
            <Bar label="Free" value={totalFree} max={total} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--muted)]">{label}</span>
        <Money value={value} />
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
