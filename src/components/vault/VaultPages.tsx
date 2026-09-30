"use client";

import { useVault } from "./VaultShell";
import { Accounts, LedgerError, Movements, Record, useLedgerChange, VaultOverview } from "./VaultLedger";
import VaultBringIn from "./VaultBringIn";
import VaultPhoneLink from "./VaultPhoneLink";
import VaultDevices from "./VaultDevices";

/**
 * The vault's pages, one component each, all reading the vault the shell
 * opened. Headings and spacing follow the owner's pages, so moving between the
 * two sides reads as one app.
 */

export function VaultDashboardPage() {
  const { document, save } = useVault();
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <VaultBringIn document={document} onBring={(next) => save(next, "records brought in")} />
      <VaultOverview document={document} />
    </div>
  );
}

export function VaultAccountsPage() {
  const { document, save, status } = useVault();
  const { change, error } = useLedgerChange(save);
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Accounts</h1>
      <LedgerError error={error} />
      <Accounts doc={document} onChange={change} saving={status} />
    </div>
  );
}

export function VaultCashFlowPage() {
  const { document, save, status } = useVault();
  const { change, error } = useLedgerChange(save);
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h1 className="text-lg font-semibold">Cash Flow</h1>
        {status && <span className="text-xs text-[var(--muted)]">{status}</span>}
      </div>
      <LedgerError error={error} />
      <Record doc={document} onChange={change} />
      <Movements doc={document} onChange={change} />
    </div>
  );
}

export function VaultDevicesPage() {
  const { session, seed, joined, onJoined } = useVault();
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Devices</h1>
      {/* On a computer only: on a phone it would be the phone offering itself. */}
      <div className="hidden sm:block">
        <VaultPhoneLink session={session} seed={seed} onJoined={onJoined} />
      </div>
      <VaultDevices session={session} refresh={joined} />
    </div>
  );
}
