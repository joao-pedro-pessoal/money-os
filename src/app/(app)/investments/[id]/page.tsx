import { getHolding, getHoldingSnapshots, updateHolding, updateHoldingPrice, deleteHolding } from "@/actions/investments";
import { marketValue, costBasis, unrealizedPnL, unrealizedPnLPercent } from "@/lib/portfolio";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { notFound } from "next/navigation";

export default async function HoldingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const holding = await getHolding(id);
  if (!holding) notFound();

  const h = {
    quantity: Number(holding.quantity),
    avgEntryPrice: Number(holding.avgEntryPrice),
    currentPrice: Number(holding.currentPrice),
  };
  const snapshots = await getHoldingSnapshots(id);
  const pnl = unrealizedPnL(h);
  const pnlColor = pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-[var(--muted)]">{holding.platform}</div>
          <h1 className="text-lg font-semibold">
            {holding.symbol}
            {holding.name && <span className="text-[var(--muted)] font-normal"> — {holding.name}</span>}
          </h1>
        </div>
        <form action={deleteHolding}>
          <input type="hidden" name="id" value={holding.id} />
          <ConfirmSubmitButton
            label="Delete position"
            confirmMessage={`Delete ${holding.symbol}? This removes the position and its price history.`}
          />
        </form>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Market Value</div>
          <div className="text-xl font-semibold">
            <Money value={marketValue(h)} currency={holding.currency} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Cost Basis</div>
          <div className="text-xl font-semibold">
            <Money value={costBasis(h)} currency={holding.currency} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>
            <Money value={pnl} currency={holding.currency} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L %</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>{unrealizedPnLPercent(h).toFixed(2)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Update price</div>
          <form action={updateHoldingPrice} className="space-y-3">
            <input type="hidden" name="id" value={holding.id} />
            <input
              name="currentPrice"
              type="number"
              step="0.0001"
              placeholder="New current price"
              className="input"
              required
            />
            <button type="submit" className="btn w-full">
              Save price
            </button>
            <p className="text-xs text-[var(--muted)]">
              Last updated{" "}
              {holding.lastPriceUpdate ? new Date(holding.lastPriceUpdate).toLocaleString("pt-PT") : "never"}. Each
              update is recorded so the value-over-time chart fills in.
            </p>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Price history</div>
          {snapshots.length === 0 ? (
            <div className="text-sm text-[var(--muted)] py-4 text-center">No history yet</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Price</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().slice(0, 10).map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.timestamp).toLocaleDateString("pt-PT")}</td>
                    <td>
                      <Money value={Number(s.price)} currency={holding.currency} />
                    </td>
                    <td>
                      <Money value={Number(s.value)} currency={holding.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-3">Edit position</div>
        <form action={updateHolding} className="space-y-3">
          <input type="hidden" name="id" value={holding.id} />
          <input name="symbol" defaultValue={holding.symbol} className="input" required />
          <input name="name" defaultValue={holding.name ?? ""} placeholder="Name" className="input" />
          <input name="platform" defaultValue={holding.platform} className="input" required />
          <div className="flex gap-2">
            <input name="quantity" type="number" step="0.00000001" defaultValue={holding.quantity} className="input" required />
            <select name="currency" defaultValue={holding.currency} className="input">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <input
            name="avgEntryPrice"
            type="number"
            step="0.0001"
            defaultValue={holding.avgEntryPrice}
            className="input"
            required
          />
          <button type="submit" className="btn w-full">
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}
