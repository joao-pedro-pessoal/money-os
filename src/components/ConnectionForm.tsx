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
}: {
  action: (formData: FormData) => Promise<void>;
  accounts: { id: string; name: string; institution: string }[];
  newAccountValue: string;
  setup: Record<
    string,
    { identifierLabel: string; identifierHint: string; needsSecret: boolean; help: string }
  >;
}) {
  const [platform, setPlatform] = useState("hyperliquid");
  const config = setup[platform];

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

      <button type="submit" className="btn w-full">
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
