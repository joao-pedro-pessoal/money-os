import {
  listHoldingsWithPnL,
  createHolding,
  getPortfolioValueOverTime,
  listAccountsForHoldings,
} from "@/actions/investments";
import { listPlaylists } from "@/actions/playlists";
import { listBalances } from "@/actions/connections";
import { Money } from "@/components/PrivacyContext";
import DonutChart from "@/components/DonutChart";
import NetWorthChart from "@/components/NetWorthChart";
import HoldingTags from "@/components/HoldingTags";
import HoldingFormFields from "@/components/HoldingFormFields";
import { RISK_LEVELS, TIME_HORIZONS, tagLabel, isStablecoin } from "@/lib/portfolio/tags";
import Link from "next/link";

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ risk?: string; time?: string }>;
}) {
  const { risk, time } = await searchParams;
  const [{ holdings, totals }, valueSeries, accountList, playlistList, syncedBalances] = await Promise.all([
    listHoldingsWithPnL(),
    getPortfolioValueOverTime(),
    listAccountsForHoldings(),
    listPlaylists(),
    listBalances(),
  ]);

  // Synced balances are shown here for completeness but are NOT part of
  // Portfolio Value: they already sit inside the connected account's balance,
  // so adding them again would count the same money twice.
  const syncedTotal = syncedBalances.reduce((s, b) => s + (b.usdValue ?? 0), 0);

  const filtered = holdings.filter(
    (h) => (!risk || h.riskLevel === risk) && (!time || h.timeHorizon === time)
  );

  const allocation = filtered
    .filter((h) => h.marketValue > 0)
    .map((h) => ({ name: h.symbol, value: h.marketValue }));

  const pnlColor = totals.totalPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";
  const realizedTotal =
    Math.round((holdings.reduce((s, h) => s + (h.realizedPnl ?? 0), 0) + Number.EPSILON) * 100) / 100;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Investments</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Manually tracked positions. Account balances hold your idle cash; these add on top.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/investments/playlists" className="btn whitespace-nowrap">
            Playlists
          </Link>
          <Link href="/investments/watchlist" className="btn whitespace-nowrap">
            Watchlist
          </Link>
          <Link href="/investments/analysis" className="btn whitespace-nowrap">
            Analysis
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Portfolio Value" value={totals.totalValue} />
        <Stat label="Cost Basis" value={totals.totalCost} />
        <Stat label="Unrealized P&L" value={totals.totalPnL} className={pnlColor} />
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L %</div>
          <div className={`text-xl font-semibold ${pnlColor}`}>{totals.totalPnLPercent.toFixed(2)}%</div>
        </div>
        <Stat
          label="Realized P&L"
          value={realizedTotal}
          className={realizedTotal >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}
        />
      </div>

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Portfolio value over time</div>
        <NetWorthChart data={valueSeries.map((p) => ({ date: p.date, netWorth: p.portfolioValue }))} />
      </div>

      {/* Full-width table: long numbers used to get clipped when it shared a row
          with the donut, so the chart now sits on its own line below. */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div className="text-sm font-medium">Holdings</div>
          <form className="flex gap-2 text-xs" method="GET">
            <select name="risk" defaultValue={risk ?? ""} className="input py-1">
              <option value="">All risk levels</option>
              {RISK_LEVELS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select name="time" defaultValue={time ?? ""} className="input py-1">
              <option value="">All time horizons</option>
              {TIME_HORIZONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn py-1 px-3">
              Filter
            </button>
          </form>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-8 text-center">
            {holdings.length === 0 ? "No holdings yet. Add your first position below." : "No holdings match this filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Account</th>
                  <th>Playlist</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Avg Entry</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">P&amp;L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/investments/${h.id}`} className="hover:underline font-medium">
                        {h.symbol}
                      </Link>
                      {h.direction === "short" && (
                        <span className="badge ml-1 text-[var(--red)] border border-[var(--red)]">SHORT</span>
                      )}
                      {h.name && <div className="text-xs text-[var(--muted)]">{h.name}</div>}
                      <HoldingTags
                        riskLevel={h.riskLevel}
                        expectedReturn={h.expectedReturn}
                        timeHorizon={h.timeHorizon}
                        liquidity={h.liquidity}
                      />
                    </td>
                    <td>
                      {h.accountName ?? <span className="text-[var(--muted)]">—</span>}
                      {h.assetType && (
                        <div className="text-xs text-[var(--muted)]">{tagLabel(h.assetType)}</div>
                      )}
                    </td>
                    <td>{h.playlistName ?? <span className="text-[var(--muted)]">—</span>}</td>
                    <td className="text-right">{h.quantity}</td>
                    <td className="text-right">
                      <Money value={h.avgEntryPrice} currency={h.currency} />
                    </td>
                    <td className="text-right">
                      <Money value={h.currentPrice} currency={h.currency} />
                    </td>
                    <td className="text-right">
                      <Money value={h.marketValue} currency={h.currency} />
                    </td>
                    <td
                      className={`text-right ${h.unrealizedPnL >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                    >
                      <Money value={h.unrealizedPnL} currency={h.currency} />
                      <div className="text-xs">{h.unrealizedPnLPercent.toFixed(1)}%</div>
                    </td>
                    <td className="text-right">
                      <Link href={`/investments/${h.id}`} className="text-xs text-[var(--accent)] hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {syncedBalances.length > 0 && (
        <div className="card p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
            <div className="text-sm font-medium">Synced balances</div>
            <div className="text-xs text-[var(--muted)]">
              not counted in Portfolio Value — already in the account balance
            </div>
          </div>
          <div className="text-xs text-[var(--muted)] mb-3">
            Pulled automatically from your connections. Total{" "}
            <Money value={syncedTotal} currency="USD" />.
          </div>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {syncedBalances.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.coin}</td>
                    <td>{b.accountName}</td>
                    <td>
                      {isStablecoin(b.coin) ? (
                        <span className="badge border border-[var(--green)] text-[var(--green)]">
                          Stablecoin
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">Cripto</span>
                      )}
                    </td>
                    <td className="text-right">{b.total}</td>
                    <td className="text-right">
                      {b.usdValue === null ? "—" : <Money value={b.usdValue} currency="USD" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Allocation</div>
          <DonutChart data={allocation} />
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Add position</div>
          <form action={createHolding} className="space-y-3">
            <input name="symbol" placeholder="Symbol (e.g. VWCE, AAPL, USDC)" className="input" required />
            <input name="name" placeholder="Name (optional)" className="input" />
            <select name="accountId" className="input" required defaultValue="">
              <option value="">Account holding this position…</option>
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution} — {a.name}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input name="quantity" type="number" step="0.00000001" placeholder="Quantity" className="input" required />
              <select name="currency" className="input">
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <HoldingFormFields playlistOptions={playlistList} />

            <button type="submit" className="btn w-full">
              Add position
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold truncate ${className}`}>
        <Money value={value} />
      </div>
    </div>
  );
}
