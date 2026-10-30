import { currentInvestments } from "@/actions/releaseEdition";
import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import {
  listAccountsWithState,
  createAccount,
  listArchivedAccounts,
  unarchiveAccount,
  listRemovableAccounts,
  removeEmptyAccounts,
} from "@/actions/accounts";
import { listConnections } from "@/actions/connections";
import { getAccountPlatformTotals } from "@/actions/platformTotals";
import ConnectablePlatforms from "@/components/ConnectablePlatforms";
import { platformOptions } from "@/lib/connectors/catalogue";
import { Money } from "@/components/PrivacyContext";
import TidyEmptyAccounts from "@/components/TidyEmptyAccounts";
import PageTabs from "@/components/PageTabs";
import { ACCOUNTS_TABS } from "@/lib/navigation";
import BalanceMeaningField from "@/components/BalanceMeaningField";
import Link from "next/link";
import Section from "@/components/Section";
import DonutChart from "@/components/DonutChart";
import AccountQuick from "@/components/AccountQuick";
import { getAccountComposition } from "@/actions/dashboard";
import { getBaseCurrency } from "@/actions/settings";

const STATE_COLOR: Record<string, string> = {
  RECONCILED: "text-[var(--green)]",
  STALE: "text-[var(--amber)]",
  OVERALLOCATED: "text-[var(--red)]",
};

export default async function AccountsPage() {
  const investmentsEnabled = await currentInvestments();
  const uiText = await textForRequest();
  const [accounts, archived, platformTotals, removable, connections, composition, baseCurrency] =
    await Promise.all([
      listAccountsWithState(),
      listArchivedAccounts(),
      getAccountPlatformTotals(),
      listRemovableAccounts(),
      listConnections(),
      getAccountComposition(),
      getBaseCurrency(),
    ]);

  // What could be connected instead of typed in, and what already is.
  const options = platformOptions(
    connections.map((c) => ({
      platform: c.platform,
      accountName: c.accountName,
    })),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{uiText("Accounts")}</h1>
      <p className="simple-only text-sm text-[var(--muted)]">{uiText("Each account’s balance and available cash. Tap its name for details and reserved money.")}</p>
      <PageTabs tabs={ACCOUNTS_TABS} />

      <TidyEmptyAccounts
        removable={removable.map((a) => ({
          id: a.id,
          name: a.name,
          institution: a.institution,
        }))}
        action={removeEmptyAccounts}
      />

      <Section title="Accounts" defaultOpen essential summary={uiText("{0} active", { "0": accounts.length })}>
        {composition.some((row) => row.composition.total > 0) && (
          <div className="mb-4">
            <DonutChart compact currency={baseCurrency} data={composition.filter((row) => row.composition.total > 0).map((row) => ({ name: row.name, value: row.composition.total }))} />
            <p className="text-xs text-[var(--muted)] mt-3">{uiText("Tap a balance to change it or add an entry.")}</p>
          </div>
        )}
        <div className="table-scroll mobile-records account-records" role="region" aria-label={uiText("Accounts")} tabIndex={0}><ResponsiveTable className="data-table" role="table">
          <thead>
            <tr>
              <th>{uiText("Institution")}</th>
              <th>{uiText("Name")}</th>
              <th>{uiText("Balance")}</th>
              <th>{uiText("Allocated")}</th>
              <th>{uiText("Free")}</th>
              <th>{uiText("Status")}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} role="row">
                <td role="cell" data-label={uiText("Institution")}><span translate="no">{a.institution}</span></td>
                <td role="cell" data-label={uiText("Name")} className="record-name">
                  <Link href={`/accounts/${a.id}`} className="hover:underline">
                    <span translate="no">{a.name}</span>
                  </Link>
                </td>
                <td role="cell" data-label={uiText("Balance")}>
                  {(() => {
                    const p = platformTotals.get(a.id);
                    const shown = p ? p.total : a.balance;
                    return (
                      <>
                        <AccountQuick account={{ id: a.id, name: a.name, currency: a.currency, balance: a.balance }} className="underline decoration-dotted underline-offset-4">
                          <Money value={shown} currency={a.currency} />
                        </AccountQuick>
                        {investmentsEnabled && p && p.unrealizedPnl !== 0 && (
                          <span
                            className={
                              "account-balance-detail " + (p.unrealizedPnl > 0
                                ? "text-[var(--green)]"
                                : "text-[var(--red)]")
                            }
                          >
                            {" "}
                            ({p.unrealizedPnl > 0 ? "+" : "−"}
                            {Math.abs(p.unrealizedPnl).toFixed(2)})
                          </span>
                        )}
                        {investmentsEnabled && p && p.spot > 0 && (
                          <div className="account-balance-detail text-[10px] text-[var(--muted)]">
                            {p.equity.toFixed(2)}{uiText(" in positions + ")}{p.spot.toFixed(2)}{" "}{uiText("spot")}</div>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td role="cell" data-label={uiText("Allocated")}>
                  <Money value={a.allocated} currency={a.currency} />
                </td>
                <td role="cell" data-label={uiText("Free")}>
                  <Money value={a.free} currency={a.currency} />
                </td>
                <td role="cell" data-label={uiText("Status")} className={STATE_COLOR[a.state]}>{a.state === "RECONCILED" ? uiText("Up to date") : a.state === "STALE" ? uiText("Needs review") : a.state === "OVERALLOCATED" ? uiText("Overallocated") : a.state}</td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable></div>
      </Section>

      <ConnectablePlatforms options={options}>
        <Section title="Add account by hand" defaultOpen className="max-w-md">
          <form action={createAccount} className="space-y-3">
            <input
              name="institution"
              placeholder={uiText("Institution (e.g. Trade Republic)")}
              className="input"
              required
            />
            <input
              name="name"
              placeholder={uiText("Name (e.g. TR Cash)")}
              className="input"
              required
            />
            <select name="accountType" className="input">
              <option value="bank">{uiText("Bank")}</option>
              {(investmentsEnabled) && <option value="broker">{uiText("Broker")}</option>}
              {(investmentsEnabled) && <option value="exchange">{uiText("Exchange")}</option>}
              <option value="cash">{uiText("Cash")}</option>
              <option value="other">{uiText("Other")}</option>
            </select>
            <div className="flex gap-2">
              <select name="currency" className="input">
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
              {/* Required: an empty balance is not a zero one (manualBalance). */}
              <input
                name="balance"
                type="number"
                step="0.01"
                required
                placeholder={uiText("Balance today (0 if empty)")}
                className="input"
              />
            </div>

            {/* Without this, typing a broker's total into the balance and also
              recording the positions counts the same money twice. */}
            <BalanceMeaningField />

            <button type="submit" className="btn w-full">{uiText("Add")}</button>
          </form>
        </Section>
      </ConnectablePlatforms>

      {archived.length > 0 && (
        <Section title="Archived accounts" summary={uiText("{0} archived", { "0": archived.length })}>
          <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table">
            <thead>
              <tr>
                <th>{uiText("Institution")}</th>
                <th>{uiText("Name")}</th>
                <th>{uiText("Balance")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {archived.map((a) => (
                <tr key={a.id}>
                  <td><span translate="no">{a.institution}</span></td>
                  <td><span translate="no">{a.name}</span></td>
                  <td>
                    <Money value={Number(a.balance)} currency={a.currency} />
                  </td>
                  <td>
                    <form action={unarchiveAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button
                        type="submit"
                        className="text-xs text-[var(--accent)] hover:underline"
                      >{uiText("Unarchive")}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable></div>
        </Section>
      )}
    </div>
  );
}
