"use client";

import { useState } from "react";

/**
 * Adding a connection.
 *
 * Which fields appear depends on the platform: Hyperliquid needs only a public
 * address, Bybit needs a key and a secret. The secret field is a password input
 * and is never rendered back — once saved it is encrypted and only a masked
 * hint is ever shown.
 */
export default function ConnectionForm({
  action,
  accounts,
  newAccountValue,
  setup,
  bybitRegions,
  secretsAvailable,
}: {
  action: (formData: FormData) => Promise<void>;
  accounts: { id: string; name: string; institution: string }[];
  newAccountValue: string;
  setup: Record<
    string,
    { identifierLabel: string; identifierHint: string; needsSecret: boolean; help: string }
  >;
  bybitRegions: readonly { value: string; label: string }[];
  /** False when ENCRYPTION_KEY is missing, so secrets cannot be stored. */
  secretsAvailable: boolean;
}) {
  const [platform, setPlatform] = useState("hyperliquid");
  const config = setup[platform];
  // A platform needing a secret cannot be set up without the encryption key.
  const blocked = config.needsSecret && !secretsAvailable;

  return (
    <form action={action} className="space-y-3">
      <select
        name="platform"
        className="input"
        value={platform}
        onChange={(e) => setPlatform(e.target.value)}
      >
        {Object.keys(setup).map((p) => (
          <option key={p} value={p}>
            {p === "hyperliquid" ? "Hyperliquid" : "Bybit"}
          </option>
        ))}
      </select>

      {platform === "bybit" && (
        <>
          <select name="region" className="input" defaultValue={bybitRegions[0]?.value}>
            {bybitRegions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted)] -mt-1">
            Bybit split in two under MiCA. If you signed up from the EU you&apos;re on bybit.eu — a key from
            one is rejected by the other.
          </p>
        </>
      )}

      <select name="accountId" className="input" required defaultValue={newAccountValue}>
        <option value={newAccountValue}>➕ Create a new account for this platform</option>
        {accounts.length > 0 && (
          <optgroup label="Or feed an existing account">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.institution} — {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <input
        name="externalId"
        placeholder={`${config.identifierLabel} (${config.identifierHint})`}
        className="input font-mono"
        required
        autoComplete="off"
      />

      {config.needsSecret && (
        <input
          name="apiSecret"
          type="password"
          placeholder="API secret"
          className="input font-mono"
          required
          autoComplete="new-password"
        />
      )}

      <input name="label" placeholder="Label (optional)" className="input" />

      {blocked && (
        <div
          className="card p-3 text-xs space-y-2"
          style={{ borderLeft: "2px solid var(--amber)" }}
        >
          <div className="text-[var(--foreground)]">
            {config.identifierLabel === "API key" ? "Bybit" : "This platform"} stores an API secret, which
            needs an encryption key. Add this line to your <span className="font-mono">.env</span>:
          </div>
          <pre className="font-mono text-[10px] bg-[var(--surface-2)] p-2 rounded overflow-x-auto">
ENCRYPTION_KEY=&quot;{"paste-a-long-random-string-here-at-least-16-chars"}&quot;
          </pre>
          <div className="text-[var(--muted)]">
            Then <span className="text-[var(--foreground)]">restart the app</span> — the file is only read at
            startup, so a change while it&apos;s running has no effect. Keep the key safe: whoever has it can
            decrypt your stored secrets, and losing it loses them.
          </div>
        </div>
      )}

      <button
        type="submit"
        className="btn w-full"
        disabled={blocked}
        style={blocked ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
      >
        Add connection
      </button>

      <p className="text-xs text-[var(--muted)]">{config.help}</p>
      <p className="text-xs text-[var(--muted)]">
        Syncing overwrites the account balance with the platform&apos;s equity, so a newly created account
        starts at 0 until the first sync.
      </p>
    </form>
  );
}
