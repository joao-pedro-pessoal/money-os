"use client";

import { useEffect, useState } from "react";
import { createVaultClient, fetchTransport, type VaultDevice, type VaultSession } from "@/lib/vault/client";

const client = createVaultClient(fetchTransport());

const when = (iso: string | null) =>
  iso === null
    ? "never"
    : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Every device signed into this vault, and a way to sign one out.
 *
 * The other half of opening the vault on a phone: a device let in by mistake,
 * or a phone that is lost, is signed out here. That stops the server serving it
 * from now on. It does not erase what the device already holds — if it was
 * kept open there, the twelve words are on it — which is said beside the button.
 */
export default function VaultDevices({ session, refresh }: { session: VaultSession; refresh: number }) {
  const [devices, setDevices] = useState<VaultDevice[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    client
      .listDevices(session.token)
      .then((list) => {
        if (!cancelled) setDevices(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setProblem(e instanceof Error ? e.message : "The devices could not be listed.");
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, refresh, reload]);

  const signOut = async (device: VaultDevice) => {
    setProblem(null);
    try {
      await client.revokeDevice(session.token, device.id);
      setReload((n) => n + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That device could not be signed out.");
    }
  };

  const active = devices?.filter((d) => d.revokedAt === null) ?? [];

  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Devices{devices ? ` · ${active.length} signed in` : ""}
      </summary>
      <div className="mt-3 space-y-2 text-xs">
        {devices === null && !problem && <p className="text-[var(--muted)]">Reading…</p>}
        {active.map((device) => (
          <div key={device.id} className="flex items-center justify-between gap-3 flex-wrap border-t border-[var(--border)] pt-2">
            <div>
              <div className="text-[var(--foreground)]">
                {device.name}
                {device.current && <span className="text-[var(--muted)]"> · this one</span>}
              </div>
              <div className="text-[var(--muted)]">
                Signed in {when(device.createdAt)} · last seen {when(device.lastSeenAt)}
              </div>
            </div>
            {!device.current && (
              <button type="button" className="btn" onClick={() => void signOut(device)}>
                Sign out
              </button>
            )}
          </div>
        ))}
        <p className="text-[11px] text-[var(--muted)] pt-1">
          Signing a device out stops it reaching your vault from now on. What it already shows stays on it until it is
          closed — and if it was kept open, the twelve words are on it: for a lost phone, sign it out here and treat
          those words as seen.
        </p>
        {problem && (
          <p role="alert" className="text-[var(--red)]">
            {problem}
          </p>
        )}
      </div>
    </details>
  );
}
