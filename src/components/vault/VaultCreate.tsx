"use client";

import Link from "next/link";
import { useState } from "react";
import type { VaultSession } from "@/lib/vault/client";
import { generateSeed } from "@/lib/vault/seed";
import { passwordProblem } from "@/lib/vault/password";
import { describeDevice } from "@/lib/vault/link";
import KeepOpenChoice from "./KeepOpenChoice";
import { createPasswordVault } from "./passwordVault";

const deviceName = () => (typeof navigator === "undefined" ? "Browser" : describeDevice(navigator.userAgent));

/**
 * Creating a vault account.
 *
 * The email and password are what the person uses from then on, on every
 * device. The twelve words are made here and kept by the server sealed, so the
 * password alone opens them (lib/vault/credentials.ts) — and they are shown
 * once, to write down, because they are the only way back in if the password
 * is forgotten. Neither the password nor the words ever reach the server.
 */
export default function VaultCreate({
  onOpen,
}: {
  onOpen: (session: VaultSession, seed: string, keep: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [freshSeed, setFreshSeed] = useState<string | null>(null);
  const [written, setWritten] = useState(false);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!email.trim()) return setError("Write the email you will sign in with.");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (!freshSeed) {
      setError(null);
      setFreshSeed(await generateSeed((n) => crypto.getRandomValues(new Uint8Array(n))));
      return;
    }
    if (!written) return setError("Write the twelve words down first. Nobody can give them back to you.");
    setBusy(true);
    setError(null);
    try {
      onOpen(await createPasswordVault(email.trim(), password, freshSeed, deviceName()), freshSeed, keep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The account could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="text-sm font-medium">Create your vault</div>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-xs">
          Email
          <input
            className="input auth-input w-full mt-1"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Password
          <input
            className="input auth-input w-full mt-1"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="text-[11px] text-[var(--muted)]">
            At least 12 characters. It is what you sign in with, and what keeps your vault closed to everyone else —
            a long one.
          </span>
        </label>
      </div>

      {freshSeed && (
        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "var(--amber)" }}>
          <div className="text-sm font-medium">Your twelve recovery words — write them on paper</div>
          <p className="font-mono text-sm break-words">{freshSeed}</p>
          <p className="text-xs text-[var(--muted)]">
            You will not type them to sign in: your email and password are enough. They are how you get back in if you
            forget the password, and the only way. Nobody else has them — not this site, not whoever runs it.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={written} onChange={(e) => setWritten(e.target.checked)} />I have written
            them down
          </label>
        </div>
      )}

      <KeepOpenChoice keep={keep} onChange={setKeep} />

      {error && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {error}
        </p>
      )}

      <button type="button" className="btn w-full min-h-11" disabled={busy} onClick={() => void create()}>
        {busy ? "Creating…" : freshSeed ? "Create my vault" : "Next: my recovery words"}
      </button>

      <p className="text-xs text-[var(--muted)]">
        Already have one?{" "}
        <Link href="/login" className="text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </div>
  );
}
