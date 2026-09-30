"use client";

import { useState } from "react";
import { replaceRecoveryCode } from "@/actions/auth";
import { signInKeyFor } from "@/lib/accounts/credentials";

/**
 * The account itself in Settings: whose it is, and a new recovery code.
 *
 * A new code asks for the password first. A session alone — a phone left
 * unlocked, a cookie seen — must not be enough to take the way back in, and
 * the old code stops working the moment the new one exists.
 */
export default function AccountSettings({ email }: { email: string | null }) {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const make = async () => {
    if (busy || !email) return;
    if (!password) return setProblem("Write your password.");
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await replaceRecoveryCode({ signInKey: await signInKeyFor(email, password) });
      if (outcome.kind === "ok") {
        setCode(outcome.recoveryCode);
        setAsking(false);
        setPassword("");
      } else if (outcome.kind === "wrong") {
        setProblem("That is not this account's password.");
      } else if (outcome.kind === "locked") {
        setProblem("Too many wrong attempts. Try again later.");
      } else {
        setProblem(outcome.reason);
      }
    } catch {
      setProblem("The server could not be reached. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="text-sm">
        Signed in as <span className="font-medium">{email ?? "—"}</span>
      </div>

      {code && (
        <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: "var(--amber)" }}>
          <div className="text-sm font-medium">Your new recovery code — write it down now</div>
          <p className="font-mono text-base tracking-wider break-all select-all">{code}</p>
          <p className="text-xs text-[var(--muted)]">The old one no longer works. This one is not shown again.</p>
        </div>
      )}

      {asking ? (
        <form
          method="post"
          action="/settings"
          className="flex flex-wrap gap-2 items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void make();
          }}
        >
          <label className="text-xs">
            Your password
            <input
              className="input mt-1"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Checking…" : "Make the new code"}
          </button>
          <button type="button" className="btn-quiet w-auto!" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="btn" disabled={!email} onClick={() => setAsking(true)}>
          New recovery code
        </button>
      )}

      {problem && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {problem}
        </p>
      )}
    </div>
  );
}
