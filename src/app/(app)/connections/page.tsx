import { currentInvestments } from "@/actions/releaseEdition";
import { currentLanguage } from "@/actions/language";
import { formatFor } from "@/lib/format";
import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import {
  listConnections,
  createConnection,
  deleteConnection,
  syncConnectionAction,
  getSyncLogs,
  autoSyncAction,
  canStoreSecrets,
  convertToManual,
} from "@/actions/connections";
import AutoSync from "@/components/AutoSync";
import PageTabs from "@/components/PageTabs";
import { investmentTabs } from "@/lib/navigation";
import { NEW_ACCOUNT, PLATFORM_SETUP, BYBIT_REGIONS, PLATFORM_LABELS } from "@/lib/connectors/constants";
import ConnectionForm from "@/components/ConnectionForm";
import { listAccountsForHoldings } from "@/actions/investments";
import { freshnessLabel, freshnessColor } from "@/lib/connectors/freshness";
import { emptyReadScope } from "@/lib/connectors/scope";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";
import Section from "@/components/Section";

export default async function ConnectionsPage() {
  const language = await currentLanguage();
  const { locale: numberLocale } = formatFor(language);
  const investmentsEnabled = await currentInvestments();
  const uiText = await textForRequest();
  const [connections, accountList, secretsAvailable] = await Promise.all([
    listConnections(),
    listAccountsForHoldings(),
    canStoreSecrets(),
  ]);
  const logsByConnection = await Promise.all(
    connections.map(async (c) => ({ id: c.id, logs: await getSyncLogs(c.id, 5) }))
  );
  const logsFor = new Map(logsByConnection.map((l) => [l.id, l.logs]));
  const failing = connections.filter((c) => c.freshness === "ERROR").length;

  return (
    <div className="space-y-6">
      <PageTabs tabs={investmentTabs(investmentsEnabled)} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{uiText("Connections")}</h1>
          {connections.length > 0 && (
            <p className="text-sm mt-1">
              {connections.length} {connections.length === 1 ? uiText("connection") : uiText("connections")}
              {failing > 0 && (
                <span className="text-[var(--red)]"> · {failing}{uiText(" failing")}</span>
              )}
            </p>
          )}
          <p className="connections-intro text-xs text-[var(--muted)] mt-1">{uiText("Read-only links to external platforms. The app can read balances and positions — it can never place an order or move funds.")}</p>
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
        <Link href="/positions" className="btn whitespace-nowrap">{uiText("Open positions")}</Link>
      </div>

      {/* Two readings of the same absence. On a hosted copy it is deliberate:
          the service shares the database, holds the secrets encrypted, and is
          never given what opens them (docs/FORA_DE_CASA.md). On the computer
          at home it is a key still to be set. The card says both, first the
          one that must not be "fixed" by pasting the key into a hosting
          service. */}
      {!secretsAvailable && (
        <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
          <div className="text-sm">{uiText("API secrets cannot be opened on this copy")}</div>
          <div className="text-xs text-[var(--muted)] mt-2 space-y-2">
            <p>{uiText("Secrets are stored encrypted, and only a copy holding")}{" "}
              <span className="font-mono text-[var(--foreground)]">{uiText("ENCRYPTION_KEY")}</span>{uiText(" can open them. On a copy running on a hosting service that is on purpose: the key stays on your own computer, so the service never holds what opens your broker accounts. Connections with a secret are synced and added there; here you see what they last read. Hyperliquid needs no secret and syncs anywhere.")}</p>
            <p>{uiText("If this ")}<span className="text-[var(--foreground)]">{uiText("is")}</span>{uiText(" your own computer, add this line to")}{" "}
              <span className="font-mono text-[var(--foreground)]">{uiText(".env")}</span>{uiText(" in the project folder:")}</p>
            <pre className="font-mono text-[10px] bg-[var(--surface-2)] p-2 rounded overflow-x-auto">
ENCRYPTION_KEY=&quot;paste-a-long-random-string-here-at-least-16-chars&quot;
            </pre>
            <p>{uiText("Then stop the app and start it again — the file is only read at startup, so editing it while the app runs changes nothing. Keep that key somewhere safe: whoever has it can decrypt your stored API secrets, and losing it means losing them.")}</p>
          </div>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">{uiText("No connections yet. Add one below.")}</div>
      ) : (
        <div className="space-y-4">
          {connections.map((c) => (
            <div
              key={c.id}
              className="connection-card card p-4"
              style={{ borderLeft: `3px solid ${freshnessColor(c.freshness)}` }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{uiText(PLATFORM_LABELS[c.platform] ?? c.platform)}</span>
                    {c.region && (
                      <span className="text-xs text-[var(--muted)]">
                        {c.region === "eu" ? uiText("bybit.eu") : uiText("bybit.com")}
                      </span>
                    )}
                    <span
                      className="badge"
                      style={{ border: `1px solid ${freshnessColor(c.freshness)}`, color: freshnessColor(c.freshness) }}
                    >
                      {uiText(freshnessLabel(c.freshness) ?? "")}
                    </span>
                  </div>
                  {c.lastSyncStatus === "ok" && (
                    <div className="text-xl font-semibold mt-2 tabular-nums">
                      <Money
                        value={Number(c.lastEquity ?? 0) + Number(c.lastSpotValue ?? 0)}
                        currency={c.reportingCurrency ?? "USD"}
                      />
                    </div>
                  )}
                  <div className="connection-extra text-xs text-[var(--muted)] mt-1 break-words">{uiText("feeds ")}<span className="text-[var(--foreground)]"><span translate="no">{c.accountName}</span></span> ·{" "}
                    <span className="font-mono">{c.externalIdMasked}</span>
                    {c.hasSecret && (
                      <span className="ml-2 badge border border-[var(--border)] text-[var(--muted)]">{uiText("secret encrypted")}</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {c.lastSyncAt
                      ? uiText("Last sync {0}", { "0": new Date(c.lastSyncAt).toLocaleString(numberLocale) })
                      : uiText("Never synced")}
                  </div>
                  {c.lastSyncError && (
                    <div className="text-xs text-[var(--red)] mt-1 max-w-xl">{c.lastSyncError}</div>
                  )}
                  {c.freshness === "ERROR" && (
                    <form action={convertToManual} className="mt-2">
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-xs text-[var(--accent)] hover:underline">{uiText("Give up on syncing — track this account manually instead")}</button>
                      <div className="connection-extra text-[10px] text-[var(--muted)] mt-1 max-w-xl">{uiText("Removes the connection and keeps the account, its balance and its history. You update the balance yourself, and everything still counts toward Net Worth, buckets and statistics — only the automatic refresh goes away.")}</div>
                    </form>
                  )}
                  {c.lastSyncStatus === "ok" && (
                    <div className="connection-extra text-xs text-[var(--muted)] mt-1">
                      {/* Each connection's own currency, not an assumption.
                          Trading 212 reports euros, and a euro figure with a
                          dollar sign is wrong by the exchange rate while
                          looking entirely normal. */}{uiText("account value")}{" "}
                      <Money
                        value={Number(c.lastEquity ?? 0)}
                        currency={c.reportingCurrency ?? "USD"}
                      />{" "}{uiText("+ coins")}{" "}
                      <Money
                        value={Number(c.lastSpotValue ?? 0)}
                        currency={c.reportingCurrency ?? "USD"}
                      />{" "}
                      ={" "}
                      <span className="text-[var(--foreground)]">
                        <Money
                          value={Number(c.lastEquity ?? 0) + Number(c.lastSpotValue ?? 0)}
                          currency={c.reportingCurrency ?? "USD"}
                        />
                      </span>
                    </div>
                  )}
                  {/* A successful zero, explained.
                      MEXC synced, reported ok, found an empty Spot wallet and
                      showed 0,00 beside a green connection — which reads as
                      "the venue holds nothing" when what was measured is "the
                      one wallet this can see holds nothing". The money was in
                      another wallet all along. The figure stays: the wallet
                      really is empty, and that is a measurement. What was
                      missing is which question it answers. */}
                  {(() => {
                    const scope = emptyReadScope({
                      status: c.lastSyncStatus,
                      equity: c.lastEquity === null ? null : Number(c.lastEquity),
                      spotValue: c.lastSpotValue === null ? null : Number(c.lastSpotValue),
                      readsOnly: PLATFORM_SETUP[c.platform]?.readsOnly ?? null,
                    });
                    if (scope === null) return null;
                    return (
                      <div className="text-xs text-[var(--amber)] mt-2 max-w-xl leading-relaxed">{uiText("Synced fine, and the ")}{scope.wallet}{uiText(" it reads is empty — so this zero is about that wallet, not about the whole account. ")}{scope.elsewhere}
                      </div>
                    );
                  })()}
                </div>

                <div className="connection-actions flex items-center gap-3">
                  {c.lockedHere ? (
                    <span className="text-xs text-[var(--muted)]" title={uiText("This copy does not hold ENCRYPTION_KEY")}>{uiText("Synced where its key is")}</span>
                  ) : (
                    <form action={syncConnectionAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="btn">{uiText("Sync now")}</button>
                    </form>
                  )}
                  <form action={deleteConnection} className="connection-remove">
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmitButton
                      label={uiText("Remove")}
                      confirmMessage={`Remove this ${c.platform} connection? Synced positions are removed too; the account and its balance stay.`}
                    />
                  </form>
                </div>
              </div>

              {/* On a phone the card says what matters — the platform, whether
                  it works, what it holds, and a button to sync. Everything else
                  is one tap away, including Remove, which should not sit beside
                  the button you press most. */}
              <details className="connections-phone-only connection-details mt-3 text-xs">
                <summary className="cursor-pointer text-[var(--accent)] py-2">{uiText("Details")}</summary>
                <div className="space-y-2 pt-1 text-[var(--muted)] break-words">
                  <div>{uiText("Feeds ")}<span className="text-[var(--foreground)]"><span translate="no">{c.accountName}</span></span> ·{" "}
                    <span className="font-mono">{c.externalIdMasked}</span>
                    {c.hasSecret && " · secret encrypted"}
                  </div>
                  {c.lastSyncStatus === "ok" && (
                    <div>{uiText("Account value ")}<Money value={Number(c.lastEquity ?? 0)} currency={c.reportingCurrency ?? "USD"} />{" "}{uiText("+ coins ")}<Money value={Number(c.lastSpotValue ?? 0)} currency={c.reportingCurrency ?? "USD"} />
                    </div>
                  )}
                  {(logsFor.get(c.id) ?? []).length > 0 && (
                    <ul className="connection-logs">
                      {(logsFor.get(c.id) ?? []).map((l) => (
                        <li key={l.id} className="connection-log">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={l.status === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}>
                              {l.status}
                            </span>
                            <span>{new Date(l.startedAt).toLocaleString(numberLocale)}</span>
                          </div>
                          <div className="text-[11px] mt-0.5">
                            {l.trigger} · {l.positionsFound ?? "—"}{uiText(" positions ·")}{" "}
                            {l.equity === null ? "—" : <Money value={Number(l.equity)} currency={c.reportingCurrency ?? "USD"} />}
                          </div>
                          {l.message && <div className="text-[11px] mt-0.5">{uiText(l.message ?? "")}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <form action={deleteConnection}>
                    <input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmitButton
                      label={uiText("Remove connection")}
                      confirmMessage={`Remove this ${c.platform} connection? Synced positions are removed too; the account and its balance stay.`}
                    />
                  </form>
                </div>
              </details>

              {(logsFor.get(c.id) ?? []).length > 0 && (
                <div className="connections-desktop-only mt-4">
                <div className="overflow-x-auto">
                  <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
                    <thead>
                      <tr>
                        <th>{uiText("When")}</th>
                        <th>{uiText("Status")}</th>
                        <th>{uiText("Trigger")}</th>
                        <th className="text-right">{uiText("Positions")}</th>
                        <th className="text-right">{uiText("Equity")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(logsFor.get(c.id) ?? []).map((l) => (
                        <tr key={l.id}>
                          <td>{new Date(l.startedAt).toLocaleString(numberLocale)}</td>
                          <td className={l.status === "ok" ? "text-[var(--green)]" : "text-[var(--red)]"}>
                            {l.status}
                            {l.message && (
                              <div
                                className="text-xs text-[var(--muted)] max-w-[28rem] truncate"
                                title={l.message}
                              >
                                {uiText(l.message ?? "")}
                              </div>
                            )}
                          </td>
                          <td>{l.trigger}</td>
                          <td className="text-right">{l.positionsFound ?? "—"}</td>
                          <td className="text-right">
                            {l.equity === null ? "—" : <Money value={Number(l.equity)} currency={c.reportingCurrency ?? "USD"} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </ResponsiveTable></div>
                </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Section title="Add connection" defaultOpen className="max-w-lg">
        <ConnectionForm
          action={createConnection}
          accounts={accountList}
          newAccountValue={NEW_ACCOUNT}
          setup={PLATFORM_SETUP}
          bybitRegions={BYBIT_REGIONS}
          secretsAvailable={secretsAvailable}
          labels={PLATFORM_LABELS}
        />
      </Section>
    </div>
  );
}