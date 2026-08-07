import { listHoldingsWithPnL, createHolding, getPortfolioValueOverTime } from "@/actions/investments";
import { Money } from "@/components/PrivacyContext";
import DonutChart from "@/components/DonutChart";
import NetWorthChart from "@/components/NetWorthChart";
import Link from "next/link";

export default async function InvestmentsPage() {
  const [{ holdings, totals }, valueSeries] = await Promise.all([
    listHoldingsWithPnL(),
    getPortfolioValueOverTime(),
  ]);

  const allocation = holdings
    .filter((h) => h.marketValue > 0)
    .map((h) => ({ name: h.symbol, value: h.marketValue }));

  const pnlColor = totals.totalPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Investments</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Manually tracked positions — separate from Money OS accounts and Net Worth. This money isn&apos;t
          guaranteed; it moves with the market.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Portfolio Value</div>
          <div className="text-xl font-semibold">
            <Money value={totals.totalValue} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Cost Basis</div>
          <div className="text-xl font-semibold">
            <Money value={totals.totalCost} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>
            <Money value={totals.totalPnL} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L %</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>{totals.totalPnLPercent.toFixed(2)}%</div>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Portfolio value over time</div>
        <NetWorthChart data={valueSeries.map((p) => ({ date: p.date, netWorth: p.portfolioValue }))} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 card p-4">
          <div className="text-sm font-medium mb-3">Holdings</div>
          {holdings.length === 0 ? (
            <div className="text-sm text-[var(--muted)] py-8 text-center">
              No holdings yet. Add your first position below.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Platform</th>
                  <th>Qty</th>
                  <th>Avg Entry</th>
                  <th>Current</th>
                  <th>Value</th>
                  <th>P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/investments/${h.id}`} className="hover:underline font-medium">
                        {h.symbol}
                      </Link>
                      {h.name && <div className="text-xs text-[var(--muted)]">{h.name}</div>}
                    </td>
                    <td>{h.platform}</td>
                    <td>{h.quantity}</td>
                    <td>
                      <Money value={h.avgEntryPrice} currency={h.currency} />
                    </td>
                    <td>
                      <Money value={h.currentPrice} currency={h.currency} />
                    </td>
                    <td>
                      <Money value={h.marketValue} currency={h.currency} />
                    </td>
                    <td className={h.unrealizedPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
                      <Money value={h.unrealizedPnL} currency={h.currency} /> ({h.unrealizedPnLPercent.toFixed(1)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Allocation</div>
          <DonutChart data={allocation} />
        </div>
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Add position</div>
        <form action={createHolding} className="space-y-3">
          <input name="symbol" placeholder="Symbol (e.g. VWCE, AAPL, BTC)" className="input" required />
          <input name="name" placeholder="Name (optional)" className="input" />
          <input name="platform" placeholder="Platform (e.g. Trade Republic, Trading 212)" className="input" required />
          <div className="flex gap-2">
            <input name="quantity" type="number" step="0.00000001" placeholder="Quantity" className="input" required />
            <select name="currency" className="input">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input name="avgEntryPrice" type="number" step="0.0001" placeholder="Avg entry price" className="input" required />
            <input name="currentPrice" type="number" step="0.0001" placeholder="Current price (defaults to entry)" className="input" />
          </div>
          <button type="submit" className="btn w-full">
            Add position
          </button>
        </form>
      </div>
    </div>
  );
}
