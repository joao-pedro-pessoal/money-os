"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteAccount, replaceRecoveryCode } from "@/actions/auth";
import { signInKeyFor } from "@/lib/accounts/credentials";
import { serverMessageIn } from "@/lib/i18n/messages";
import { useLanguage } from "./LanguageContext";

/**
 * The account itself in Settings: whose it is, and a new recovery code.
 *
 * A new code asks for the password first. A session alone — a phone left
 * unlocked, a cookie seen — must not be enough to take the way back in, and
 * the old code stops working the moment the new one exists.
 */
export default function AccountSettings({ email, canDelete }: { email: string | null; canDelete: boolean }) {
  const router = useRouter();
  const { m } = useLanguage();
  const w = m.account;
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
    if (!password) return setProblem(w.writePassword);
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await replaceRecoveryCode({ signInKey: await signInKeyFor(email, password) });
      if (outcome.kind === "ok") {
        setCode(outcome.recoveryCode);
        setAsking(false);
        setPassword("");
      } else if (outcome.kind === "wrong") {
        setProblem(w.notThisPassword);
      } else if (outcome.kind === "locked") {
        setProblem(w.tooMany);
      } else {
        setProblem(serverMessageIn(m, outcome.reason));
      }
    } catch {
      setProblem(w.unreachable);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (busy || !email) return;
    if (!deletePassword) return setDeleteProblem(w.writePassword);
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
          ? w.notThisPasswordNothingDeleted
          : outcome.kind === "locked"
            ? w.tooMany
            : serverMessageIn(m, outcome.reason)
      );
    } catch {
      setDeleteProblem(w.unreachableNothingDeleted);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="text-sm">
        {w.signedInAs} <span className="font-medium">{email ?? "—"}</span>
      </div>

      {code && (
        <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: "var(--amber)" }}>
          <div className="text-sm font-medium">{w.newCodeTitle}</div>
          <p className="font-mono text-base tracking-wider break-all select-all">{code}</p>
          <p className="text-xs text-[var(--muted)]">{w.newCodeNote}</p>
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
            {w.yourPassword}
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
            {busy ? w.checking : w.makeCode}
          </button>
          <button type="button" className="btn-quiet w-auto!" onClick={() => setAsking(false)}>
            {w.cancel}
          </button>
        </form>
      ) : (
        <button type="button" className="btn" disabled={!email} onClick={() => setAsking(true)}>
          {w.newCode}
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
                {w.deleteWarning}
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="text-xs">
                  {w.typeEmail}
                  <input
                    className="input mt-1"
                    type="email"
                    autoComplete="off"
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                  />
                </label>
                <label className="text-xs">
                  {w.yourPassword}
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
                  {busy ? w.deleting : w.deleteMine}
                </button>
                <button type="button" className="btn-quiet w-auto!" onClick={() => setDeleting(false)}>
                  {w.cancel}
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
              {w.deleteStart}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
