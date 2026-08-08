import {
  listConnections,
  createConnection,
  deleteConnection,
  syncConnectionAction,
  getSyncLogs,
  autoSyncAction,
  canStoreSecrets,
} from "@/actions/connections";
import AutoSync from "@/components/AutoSync";
import { NEW_ACCOUNT, PLATFORM_SETUP, BYBIT_REGIONS } from "@/lib/connectors/constants";
import ConnectionForm from "@/components/ConnectionForm";
import { listAccountsForHoldings } from "@/actions/investments";
import { freshnessLabel, freshnessColor } from "@/lib/connectors/freshness";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function ConnectionsPage() {
  const [connections, accountList, secretsAvailable] = await Promise.all([
    listConnections(),
    listAccountsForHoldings(),
    canStoreSecrets(),
  ]);
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
          {connections.length > 0 && (
            <div className="mt-1">
              <AutoSync
                syncAction={autoSyncAction}
                lastSyncAt={
                  connections
                    .map((c) => c.lastSyncAt)
                    .filter((d): d is Date => d !== null)
                    .sort((a, b) => b.getTime() - a.getTime())[0]
                    ?.toISOString() ?? null
                }
              />
            </div>
          )}
        </div>
        <Link href="/positions" className="btn whitespace-nowrap">
          Open positions
        </Link>
      </div>

      {!secretsAvailable && (
        <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
          <div className="text-sm">Bybit is unavailable until you set an encryption key</div>
          <div className="text-xs text-[var(--muted)] mt-2 space-y-2">
            <p>
              Bybit needs an API secret, and secrets are never stored unencrypted. Add this line to{" "}
              <span className="font-mono text-[var(--foreground)]">.env</span> in the project folder:
            </p>
            <pre className="font-mono text-[10px] bg-[var(--surface-2)] p-2 rounded overflow-x-auto">
ENCRYPTION_KEY=&quot;paste-a-long-random-string-here-at-least-16-chars&quot;
            </pre>
            <p>
              Then stop the app and run{" "}
              <span className="font-mono text-[var(--foreground)]">npm run dev</span> again — the file is only
              read at startup, so editing it while the app runs changes nothing.
            </p>
            <p>
              Keep that key somewhere safe. Whoever has it can decrypt your stored API secrets, and losing it
              means losing them. Hyperliquid needs no key — its read endpoint is public.
            </p>
          </div>
        </div>
      )}

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
                    {c.region && (
                      <span className="text-xs text-[var(--muted)]">
                        {c.region === "eu" ? "bybit.eu" : "bybit.com"}
                      </span>
                    )}
                    <span
                      className="badge"
                      style={{ border: `1px solid ${freshnessColor(c.freshness)}`, color: freshnessColor(c.freshness) }}
                    >
                      {freshnessLabel(c.freshness)}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    feeds <span className="text-[var(--foreground)]">{c.accountName}</span> ·{" "}
                    <span className="font-mono">{c.externalIdMasked}</span>
                    {c.hasSecret && (
                      <span className="ml-2 badge border border-[var(--border)] text-[var(--muted)]">
                        secret encrypted
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {c.lastSyncAt
                      ? `Last sync ${new Date(c.lastSyncAt).toLocaleString("pt-PT")}`
                      : "Never synced"}
                  </div>
                  {c.lastSyncError && (
                    <div className="text-xs text-[var(--red)] mt-1 max-w-xl">{c.lastSyncError}</div>
                  )}
                  {c.lastSyncStatus === "ok" && (
                    <div className="text-xs text-[var(--muted)] mt-2">
                      perps equity <Money value={Number(c.lastEquity ?? 0)} currency="USD" /> + spot{" "}
                      <Money value={Number(c.lastSpotValue ?? 0)} currency="USD" /> ={" "}
                      <span className="text-[var(--foreground)]">
                        <Money
                          value={Number(c.lastEquity ?? 0) + Number(c.lastSpotValue ?? 0)}
                          currency="USD"
                        />
                      </span>
                    </div>
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
        <ConnectionForm
          action={createConnection}
          accounts={accountList}
          newAccountValue={NEW_ACCOUNT}
          setup={PLATFORM_SETUP}
          bybitRegions={BYBIT_REGIONS}
          secretsAvailable={secretsAvailable}
        />
      </div>
    </div>
  );
}