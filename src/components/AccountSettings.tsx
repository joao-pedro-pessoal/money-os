"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteAccount, replaceRecoveryCode } from "@/actions/auth";
import { signInKeyFor } from "@/lib/accounts/credentials";

/**
 * The account itself in Settings: whose it is, and a new recovery code.
 *
 * A new code asks for the password first. A session alone — a phone left
 * unlocked, a cookie seen — must not be enough to take the way back in, and
 * the old code stops working the moment the new one exists.
 */
export default function AccountSettings({ email, canDelete }: { email: string | null; canDelete: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null);
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

  const remove = async () => {
    if (busy || !email) return;
    if (!deletePassword) return setDeleteProblem("Write your password.");
    setBusy(true);
    setDeleteProblem(null);
    try {
      const outcome = await deleteAccount({
        signInKey: await signInKeyFor(email, deletePassword),
        confirmEmail,
      });
      if (outcome.kind === "deleted") {
        router.replace("/login");
        return;
      }
      setDeleteProblem(
        outcome.kind === "wrong"
          ? "That is not this account's password. Nothing was deleted."
          : outcome.kind === "locked"
            ? "Too many wrong attempts. Try again later."
            : outcome.reason
      );
    } catch {
      setDeleteProblem("The server could not be reached. Nothing was deleted.");
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

      {canDelete && (
        <div className="pt-3 mt-3 border-t border-[var(--border)] space-y-2">
          {deleting ? (
            <form
              method="post"
              action="/settings"
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              <p className="text-xs text-[var(--red)]">
                This deletes your account and everything in it — accounts, movements, investments, budgets, all of it.
                It cannot be undone, and nobody can bring it back.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="text-xs">
                  Type your email
                  <input
                    className="input mt-1"
                    type="email"
                    autoComplete="off"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  Your password
                  <input
                    className="input mt-1"
                    type="password"
                    autoComplete="current-password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="btn"
                  style={{ background: "var(--red)", color: "var(--background)" }}
                  disabled={busy || confirmEmail.trim().toLowerCase() !== (email ?? "").toLowerCase()}
                >
                  {busy ? "Deleting…" : "Delete my account"}
                </button>
                <button type="button" className="btn-quiet w-auto!" onClick={() => setDeleting(false)}>
                  Cancel
                </button>
              </div>
              {deleteProblem && (
                <p role="alert" className="text-xs text-[var(--red)]">
                  {deleteProblem}
                </p>
              )}
            </form>
          ) : (
            <button
              type="button"
              className="text-xs text-[var(--red)] hover:underline"
              disabled={!email}
              onClick={() => setDeleting(true)}
            >
              Delete my account…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
