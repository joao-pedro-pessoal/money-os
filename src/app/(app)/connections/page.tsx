import {
  listConnections,
  createConnection,
  deleteConnection,
  syncConnectionAction,
  getSyncLogs,
} from "@/actions/connections";
import { NEW_ACCOUNT } from "@/lib/connectors/constants";
import { listAccountsForHoldings } from "@/actions/investments";
import { freshnessLabel, freshnessColor } from "@/lib/connectors/freshness";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function ConnectionsPage() {
  const [connections, accountList] = await Promise.all([listConnections(), listAccountsForHoldings()]);
  const logsByConnection = await Promise.all(
    connections.map(async (c) => ({ id: c.id, logs: await getSyncLogs(c.id, 5) }))
  );
  const logsFor = new Map(logsByConnection.map((l) => [l.id, l.logs]));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Connections</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Read-only links to external platforms. The app can read balances and positions — it can never place
            an order or move funds.
          </p>
        </div>
        <Link href="/positions" className="btn whitespace-nowrap">
          Open positions
        </Link>
      </div>

      {connections.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          No connections yet. Add one below.
        </div>
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{c.platform}</span>
                    <span
                      className="badge"
                      style={{ border: `1px solid ${freshnessColor(c.freshness)}`, color: freshnessColor(c.freshness) }}
                    >
                      {freshnessLabel(c.freshness)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    feeds <span className="text-[var(--foreground)]">{c.accountName}</span> ·{" "}
                    <span className="font-mono">
                      {c.externalId.slice(0, 6)}…{c.externalId.slice(-4)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {c.lastSyncAt
                      ? `Last sync ${new Date(c.lastSyncAt).toLocaleString("pt-PT")}`
                      : "Never synced"}
                  </div>
                  {c.lastSyncError && (
                    <div className="text-xs text-[var(--red)] mt-1 max-w-xl">{c.lastSyncError}</div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <form action={syncConnectionAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="btn">
                      Sync now
                    </button>
                  </form>
                  <form action={deleteConnection}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmitButton
                      label="Remove"
                      confirmMessage={`Remove this ${c.platform} connection? Synced positions are removed too; the account and its balance stay.`}
                    />
                  </form>
                </div>
              </div>

              {(logsFor.get(c.id) ?? []).length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="data-table whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Status</th>
                        <th>Trigger</th>
                        <th className="text-right">Positions</th>
                        <th className="text-right">Equity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(logsFor.get(c.id) ?? []).map((l) => (
                        <tr key={l.id}>
                          <td>{new Date(l.startedAt).toLocaleString("pt-PT")}</td>
                          <td className={l.status === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}>
                            {l.status}
                            {l.message && <div className="text-xs text-[var(--muted)]">{l.message}</div>}
                          </td>
                          <td>{l.trigger}</td>
                          <td className="text-right">{l.positionsFound ?? "—"}</td>
                          <td className="text-right">
                            {l.equity === null ? "—" : <Money value={Number(l.equity)} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-3">Add connection</div>
        <form action={createConnection} className="space-y-3">
          <select name="platform" className="input" defaultValue="hyperliquid">
            <option value="hyperliquid">Hyperliquid</option>
          </select>
          <select name="accountId" className="input" required defaultValue={NEW_ACCOUNT}>
            <option value={NEW_ACCOUNT}>➕ Create a new account for this platform</option>
            {accountList.length > 0 && (
              <optgroup label="Or feed an existing account">
                {accountList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institution} — {a.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <input
            name="externalId"
            placeholder="Wallet address (0x… , 42 characters)"
            className="input font-mono"
            required
          />
          <input name="label" placeholder="Label (optional)" className="input" />
          <button type="submit" className="btn w-full">
            Add connection
          </button>
          <p className="text-xs text-[var(--muted)]">
            Hyperliquid&apos;s read-only endpoint needs only your public wallet address — no API key, no
            password, nothing secret. Syncing overwrites the account balance with the exchange&apos;s equity,
            so a newly created account starts at 0 until the first sync.
          </p>
        </form>
      </div>
    </div>
  );
}
