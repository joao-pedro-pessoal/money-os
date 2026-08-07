import { listAllPositions } from "@/actions/connections";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function PositionsPage() {
  const positions = await listAllPositions();

  const totalUnrealized = positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const totalNotional = positions.reduce((s, p) => s + (p.positionValue ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Open positions</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Live from your connected platforms.
          </p>
        </div>
        <Link href="/connections" className="btn whitespace-nowrap">
          Connections
        </Link>
      </div>

      <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
        <div className="text-sm">
          These positions are <span className="text-[var(--amber)]">already included</span> in each
          account&apos;s balance.
        </div>
        <div className="text-xs text-[var(--muted)] mt-1">
          The exchange reports account equity, which already contains the unrealized P&amp;L below. Net Worth
          uses that equity — the position values here are shown for detail and are never added on top, or the
          same money would be counted twice.
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          No open positions. Add a connection and hit &quot;Sync now&quot;.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)] mb-1">Open positions</div>
              <div className="text-xl font-semibold">{positions.length}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)] mb-1">Total notional</div>
              <div className="text-xl font-semibold truncate">
                <Money value={totalNotional} />
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-[var(--muted)] mb-1">Unrealized P&amp;L</div>
              <div
                className={`text-xl font-semibold truncate ${
                  totalUnrealized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                }`}
              >
                <Money value={totalUnrealized} />
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="overflow-x-auto">
              <table className="data-table whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Side</th>
                    <th>Account</th>
                    <th className="text-right">Size</th>
                    <th className="text-right">Entry</th>
                    <th className="text-right">Mark</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Leverage</th>
                    <th className="text-right">Liquidation</th>
                    <th className="text-right">Unrealized P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.coin}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            border: `1px solid ${p.side === "long" ? "var(--green)" : "var(--red)"}`,
                            color: p.side === "long" ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {p.side.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {p.accountName}
                        <div className="text-xs text-[var(--muted)] capitalize">{p.platform}</div>
                      </td>
                      <td className="text-right">{p.size}</td>
                      <td className="text-right">
                        {p.entryPrice === null ? "—" : <Money value={p.entryPrice} />}
                      </td>
                      <td className="text-right">
                        {p.markPrice === null ? "—" : <Money value={p.markPrice} />}
                      </td>
                      <td className="text-right">
                        {p.positionValue === null ? "—" : <Money value={p.positionValue} />}
                      </td>
                      <td className="text-right">
                        {p.leverage === null ? "—" : `${p.leverage}x`}
                        {p.leverageType && (
                          <div className="text-xs text-[var(--muted)]">{p.leverageType}</div>
                        )}
                      </td>
                      <td className="text-right text-[var(--amber)]">
                        {p.liquidationPrice === null ? "—" : <Money value={p.liquidationPrice} />}
                      </td>
                      <td
                        className={`text-right ${
                          (p.unrealizedPnl ?? 0) >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                        }`}
                      >
                        {p.unrealizedPnl === null ? "—" : <Money value={p.unrealizedPnl} />}
                        {p.returnOnEquity !== null && (
                          <div className="text-xs">{(p.returnOnEquity * 100).toFixed(2)}%</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
