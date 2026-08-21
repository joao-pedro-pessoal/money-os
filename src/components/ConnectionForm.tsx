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
  labels,
}: {
  action: (formData: FormData) => Promise<void>;
  accounts: { id: string; name: string; institution: string }[];
  newAccountValue: string;
  setup: Record<
    string,
    {
      identifierLabel: string;
      identifierHint: string;
      needsSecret: boolean;
      help: string;
      steps: string[];
      warning?: string;
    }
  >;
  bybitRegions: readonly { value: string; label: string }[];
  /** False when ENCRYPTION_KEY is missing, so secrets cannot be stored. */
  secretsAvailable: boolean;
  /** Display name per platform, so adding one doesn't mean editing this file. */
  labels: Record<string, string>;
}) {
  // Kept above the early declarations so hooks always run in the same order.
  const [platform, setPlatform] = useState("hyperliquid");
  const [hovered, setHovered] = useState<string | null>(null);
  const config = setup[platform];
  // Pointing at a platform previews its steps without committing to it.
  const shown = hovered ?? platform;
  const shownConfig = setup[shown] ?? config;
  // A platform needing a secret cannot be set up without the encryption key.
  const blocked = config.needsSecret && !secretsAvailable;

  return (
    <form action={action} className="space-y-3">
      {/* Buttons rather than a dropdown, so the setup steps can be read by
          pointing at a platform — most of the work with these connectors
          happens outside the app, and finding that out after filling in the
          form is the wrong order. */}
      <input type="hidden" name="platform" value={platform} />
      <div className="flex gap-2 flex-wrap">
        {Object.keys(setup).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            onMouseEnter={() => setHovered(p)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(p)}
            onBlur={() => setHovered(null)}
            className="btn py-1 px-3 text-sm"
            style={
              platform === p
                ? undefined
                : { background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }
            }
          >
            {labels[p] ?? p}
          </button>
        ))}
      </div>

      {/* Shows whichever platform is being pointed at, falling back to the
          selected one so the panel never goes blank. */}
      <div className="card p-3 text-xs space-y-2" style={{ background: "var(--surface-2)" }}>
        <div className="font-medium text-[var(--foreground)]">
          {labels[shown] ?? shown} — what you need to do
        </div>
        <ol className="space-y-1 list-decimal list-inside text-[var(--muted)]">
          {shownConfig.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {shownConfig.warning && (
          <div className="text-[var(--amber)] pt-1">{shownConfig.warning}</div>
        )}
      </div>

      {/* Only one Bybit entity can authenticate, so the choice is sent
          silently rather than offered as a decision that isn't one. */}
      {platform === "bybit" && (
        bybitRegions.length > 1 ? (
          <select name="region" className="input" defaultValue={bybitRegions[0]?.value}>
            {bybitRegions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="region" value={bybitRegions[0]?.value ?? ""} />
        )
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

      {/* IBKR's gateway knows its own account id, so the field is optional
          there — and left blank it avoids the easy mistake of typing the
          gateway login username instead. */}
      <input
        name="externalId"
        placeholder={
          platform === "ibkr"
            ? "Account id — leave empty to detect it automatically"
            : `${config.identifierLabel} (${config.identifierHint})`
        }
        className="input font-mono"
        required={platform !== "ibkr"}
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
