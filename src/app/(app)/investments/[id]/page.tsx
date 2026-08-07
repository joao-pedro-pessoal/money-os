import {
  getHolding,
  getHoldingSnapshots,
  updateHolding,
  updateHoldingPrice,
  deleteHolding,
  listAccountsForHoldings,
  addRewards,
} from "@/actions/investments";
import HoldingTags from "@/components/HoldingTags";
import { RISK_LEVELS, EXPECTED_RETURNS, TIME_HORIZONS, LIQUIDITY_LEVELS, ASSET_TYPES, tagLabel } from "@/lib/portfolio/tags";
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
  const accountList = await listAccountsForHoldings();
  const holdingAccount = accountList.find((a) => a.id === holding.accountId);
  const pnl = unrealizedPnL(h);
  const pnlColor = pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-[var(--muted)]">
            {holdingAccount?.name ?? holding.platform ?? "No account linked"}
            {holding.assetType && <span> · {tagLabel(holding.assetType)}</span>}
          </div>
          <h1 className="text-lg font-semibold">
            {holding.symbol}
            {holding.name && <span className="text-[var(--muted)] font-normal"> — {holding.name}</span>}
          </h1>
          <HoldingTags
            riskLevel={holding.riskLevel}
            expectedReturn={holding.expectedReturn}
            timeHorizon={holding.timeHorizon}
            liquidity={holding.liquidity}
          />
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
        <div className="text-sm font-medium mb-3">Staking / rewards</div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">APR</div>
            <div className="text-sm">{holding.apr ? `${Number(holding.apr).toFixed(2)}%` : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Projected / year</div>
            <div className="text-sm">
              {holding.apr ? (
                <Money value={(marketValue(h) * Number(holding.apr)) / 100} currency={holding.currency} />
              ) : (
                "—"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Rewards received</div>
            <div className="text-sm text-[var(--green)]">
              <Money value={Number(holding.rewardsEarned ?? 0)} currency={holding.currency} />
            </div>
          </div>
        </div>
        <form action={addRewards} className="flex gap-2">
          <input type="hidden" name="id" value={holding.id} />
          <input
            name="amount"
            type="number"
            step="0.01"
            placeholder="Rewards received now"
            className="input"
            required
          />
          <button type="submit" className="btn whitespace-nowrap">
            Add
          </button>
        </form>
        <p className="text-xs text-[var(--muted)] mt-2">
          &quot;Projected / year&quot; is an estimate from the APR. &quot;Rewards received&quot; is what actually
          landed — the two are kept apart on purpose.
        </p>
      </div>

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-3">Edit position</div>
        <form action={updateHolding} className="space-y-3">
          <input type="hidden" name="id" value={holding.id} />
          <input name="symbol" defaultValue={holding.symbol} className="input" required />
          <input name="name" defaultValue={holding.name ?? ""} placeholder="Name" className="input" />
          <select name="accountId" defaultValue={holding.accountId ?? ""} className="input" required>
            <option value="">Account holding this position…</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.institution} — {a.name}
              </option>
            ))}
          </select>
          <select name="assetType" className="input" defaultValue={holding.assetType ?? ""}>
            <option value="">Asset type — unset</option>
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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

          <input
            name="apr"
            type="number"
            step="0.0001"
            defaultValue={holding.apr ?? ""}
            placeholder="APR % (only for staking / yield positions)"
            className="input"
          />
          <input type="hidden" name="rewardsEarned" value={String(holding.rewardsEarned ?? 0)} />

          <div className="pt-1 text-xs text-[var(--muted)]">Asset allocation tags</div>
          <div className="grid grid-cols-2 gap-2">
            <select name="riskLevel" className="input" defaultValue={holding.riskLevel ?? ""}>
              <option value="">Risk — unset</option>
              {RISK_LEVELS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select name="timeHorizon" className="input" defaultValue={holding.timeHorizon ?? ""}>
              <option value="">Time horizon — unset</option>
              {TIME_HORIZONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select name="expectedReturn" className="input" defaultValue={holding.expectedReturn ?? ""}>
              <option value="">Expected return — unset</option>
              {EXPECTED_RETURNS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select name="liquidity" className="input" defaultValue={holding.liquidity ?? ""}>
              <option value="">Liquidity — unset</option>
              {LIQUIDITY_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn w-full">
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}
