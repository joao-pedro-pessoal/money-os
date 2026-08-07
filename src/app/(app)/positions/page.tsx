import {
  listAllPositions,
  listBalances,
  listConnections,
  autoSyncAction,
  setPositionTags,
} from "@/actions/connections";
import { listPlaylists } from "@/actions/playlists";
import PositionTagsForm from "@/components/PositionTagsForm";
import AutoSync from "@/components/AutoSync";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function PositionsPage() {
  const [positions, balances, connections, playlistList] = await Promise.all([
    listAllPositions(),
    listBalances(),
    listConnections(),
    listPlaylists(),
  ]);

  const lastSyncAt = connections
    .map((c) => c.lastSyncAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const totalEquity = connections.reduce((s, c) => s + Number(c.lastEquity ?? 0), 0);
  const totalSpot = connections.reduce((s, c) => s + Number(c.lastSpotValue ?? 0), 0);
  const totalFree = connections.reduce((s, c) => s + Number(c.lastWithdrawable ?? 0), 0);
  const totalMargin = connections.reduce((s, c) => s + Number(c.lastMarginUsed ?? 0), 0);

  const totalUnrealized = positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const totalNotional = positions.reduce((s, p) => s + (p.positionValue ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Open positions &amp; balances</h1>
          <p className="text-xs text-[var(--muted)] mt-1">Live from your connected platforms.</p>
          {connections.length > 0 && (
            <div className="mt-1">
              <AutoSync syncAction={autoSyncAction} lastSyncAt={lastSyncAt ? lastSyncAt.toISOString() : null} />
            </div>
          )}
        </div>
        <Link href="/connections" className="btn whitespace-nowrap">
          Connections
        </Link>
      </div>

      {connections.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Perps equity</div>
            <div className="text-xl font-semibold truncate">
              <Money value={totalEquity} currency="USD" />
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-1">includes open position P&amp;L</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Spot balances</div>
            <div className="text-xl font-semibold truncate">
              <Money value={totalSpot} currency="USD" />
            </div>
            <div className="text-[10px] text-[var(--muted)] mt-1">separate pool, added on top</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Free / withdrawable</div>
            <div className="text-xl font-semibold truncate text-[var(--green)]">
              <Money value={totalFree} currency="USD" />
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-[var(--muted)] mb-1">Margin in use</div>
            <div className="text-xl font-semibold truncate text-[var(--amber)]">
              <Money value={totalMargin} currency="USD" />
            </div>
          </div>
        </div>
      )}

      {balances.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Spot balances</div>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Account</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.coin}</td>
                    <td>{b.accountName}</td>
                    <td className="text-right">{b.total}</td>
                    <td className="text-right">
                      {b.available}
                      {b.hold > 0 && (
                        <div className="text-xs text-[var(--muted)]">{b.hold} on hold</div>
                      )}
                    </td>
                    <td className="text-right">
                      {b.price === null ? (
                        <span className="text-[var(--muted)]">unpriced</span>
                      ) : (
                        <Money value={b.price} currency="USD" />
                      )}
                    </td>
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

      <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
        <div className="text-sm">
          These positions are <span className="text-[var(--amber)]">already included</span> in each
          account&apos;s balance.
        </div>
        <div className="text-xs text-[var(--muted)] mt-1">
          The exchange reports account equity, which already contains the unrealized P&amp;L below, so position
          values are never added on top — that would count the same money twice. Spot balances are a separate
          pool, so those <em>are</em> added. The account balance is <strong>perps equity + spot</strong>.
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          {connections.length === 0
            ? "No connections yet — add one first."
            : "No open positions right now."}
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
                    <th>Tags</th>
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
                      <td className="whitespace-normal">
                        <PositionTagsForm
                          action={setPositionTags}
                          connectionId={p.connectionId}
                          coin={p.coin}
                          riskLevel={p.riskLevel}
                          expectedReturn={p.expectedReturn}
                          timeHorizon={p.timeHorizon}
                          liquidity={p.liquidity}
                          playlistId={p.playlistId}
                          notes={p.notes}
                          playlists={playlistList}
                        />
                      </td>
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
