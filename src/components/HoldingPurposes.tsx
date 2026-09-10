import { getHoldingAllocations, setHoldingAllocation, removeHoldingAllocation } from "@/actions/purpose";

/**
 * Which goals this position is funding, and by how much.
 *
 * A share rather than an amount: allocating a fixed €1 500 of an ETF stops
 * being true the moment the price moves, and then either the goal silently
 * changes size or the remainder has to go somewhere. A percentage tracks the
 * market honestly — including downwards.
 */
export default async function HoldingPurposes({ holdingId }: { holdingId: string }) {
  const data = await getHoldingAllocations(holdingId);

  return (
    <div className="card p-4">
      <div className="text-sm font-medium">What is this for?</div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-3 max-w-xl">
        Split this position across your goals. Shares, not amounts — a fixed euro figure would stop
        being true as soon as the price moved.
      </p>

      {data.overAllocated && (
        <div className="text-xs text-[var(--red)] mb-3">
          ⚠ {data.allocated}% of this position is promised to goals. At least one of them is counting
          money that isn&apos;t there.
        </div>
      )}

      {data.allocations.length > 0 && (
        <ul className="space-y-2 mb-3">
          {data.allocations.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{a.bucketName}</span>
              <form action={setHoldingAllocation} className="flex items-center gap-1">
                <input type="hidden" name="holdingId" value={holdingId} />
                <input type="hidden" name="bucketId" value={a.bucketId} />
                <input
                  name="percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={a.percent}
                  className="input input-narrow text-xs py-1 w-20"
                />
                <span className="text-xs text-[var(--muted)]">%</span>
                <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                  Save
                </button>
              </form>
              <form action={removeHoldingAllocation}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="text-xs text-[var(--muted)] hover:underline">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="text-xs text-[var(--muted)] mb-3">
        {data.unallocated > 0
          ? `${data.unallocated}% not assigned to any goal.`
          : "Fully assigned."}
      </div>

      {data.available.length > 0 ? (
        <form action={setHoldingAllocation} className="flex gap-2">
          <input type="hidden" name="holdingId" value={holdingId} />
          <select name="bucketId" className="input text-xs" required>
            {data.available.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            name="percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="%"
            defaultValue={data.unallocated || ""}
            className="input input-narrow text-xs w-24"
            required
          />
          <button type="submit" className="btn whitespace-nowrap text-xs py-1">
            Assign
          </button>
        </form>
      ) : (
        <div className="text-xs text-[var(--muted)]">
          Every goal already has a share of this position.
        </div>
      )}
    </div>
  );
}
