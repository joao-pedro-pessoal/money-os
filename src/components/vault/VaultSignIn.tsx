"use client";

import { useState } from "react";
import { createVaultClient, fetchTransport, type VaultSession } from "@/lib/vault/client";
import { generateSeed, isValidSeed } from "@/lib/vault/seed";
import { passwordProblem } from "@/lib/vault/password";

const client = createVaultClient(fetchTransport());
const deviceName = () => (typeof navigator === "undefined" ? "Browser" : navigator.userAgent.slice(0, 60));

/**
 * Creating a vault account, or signing one in on this device.
 *
 * Two secrets, and they do different jobs. The **password** proves to the server
 * that the account is yours; the **twelve words** unlock what is inside, and the
 * server never sees them. That is what makes the vault unreadable to whoever
 * runs this site — and why losing both means losing the money records, which is
 * said here, before an account exists, rather than in a help page afterwards.
 */
export default function VaultSignIn({ onOpen }: { onOpen: (session: VaultSession, seed: string) => void }) {
  const [mode, setMode] = useState<"in" | "new">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [seed, setSeed] = useState("");
  const [freshSeed, setFreshSeed] = useState<string | null>(null);
  const [written, setWritten] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (!freshSeed) {
      setFreshSeed(await generateSeed((n) => crypto.getRandomValues(new Uint8Array(n))));
      return;
    }
    if (!written) return setError("Write the twelve words down first. Nobody can give them back to you.");
    setBusy(true);
    setError(null);
    try {
      onOpen(await client.register(email.trim(), password, deviceName()), freshSeed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const enter = async () => {
    if (!isValidSeed(seed)) return setError("Those are not the twelve words of a recovery seed.");
    setBusy(true);
    setError(null);
    try {
      onOpen(await client.login(email.trim(), password, deviceName()), seed.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 space-y-4 max-w-xl">
      <div className="flex gap-2">
        {(["in", "new"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="btn"
            aria-pressed={mode === value}
            style={{
              background: "var(--surface)",
              border: `1px solid ${mode === value ? "var(--accent)" : "var(--border)"}`,
              color: mode === value ? "var(--accent)" : "var(--muted)",
            }}
            onClick={() => {
              setMode(value);
              setError(null);
            }}
          >
            {value === "in" ? "Sign in" : "Create an account"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs">
          Email
          <input
            className="input w-full mt-1"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Password
          <input
            className="input w-full mt-1"
            type="password"
            autoComplete={mode === "new" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      {mode === "in" ? (
        <label className="text-xs block">
          Your twelve words
          <textarea
            className="input w-full mt-1"
            rows={2}
            autoComplete="off"
            spellCheck={false}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="word word word …"
          />
          <span className="text-[11px] text-[var(--muted)]">
            They stay in this browser tab and are never sent. Without them the vault cannot be opened, here or by
            anyone else.
          </span>
        </label>
      ) : (
        freshSeed && (
          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--amber)" }}>
            <div className="text-sm font-medium">Write these twelve words down, on paper</div>
            <p className="font-mono text-sm break-words">{freshSeed}</p>
            <p className="text-xs text-[var(--muted)]">
              They are the key to your money records. They are not stored on the server, so if you lose them and your
              password, nobody — including whoever runs this site — can get your data back.
            </p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} />I have written
              them down
            </label>
          </div>
        )
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {error}
        </p>
      )}

      <button type="button" className="btn" disabled={busy} onClick={mode === "in" ? enter : create}>
        {busy ? "Working…" : mode === "in" ? "Open my vault" : freshSeed ? "Create the account" : "Show my twelve words"}
      </button>
    </div>
  );
}
