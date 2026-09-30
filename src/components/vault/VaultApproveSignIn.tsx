"use client";

import { useEffect, useState } from "react";
import { browserRandom, createVaultClient, fetchTransport, type VaultSession } from "@/lib/vault/client";
import { readLinkFragment, sealSeed } from "@/lib/vault/link";
import { recallVault } from "./storage";

const client = createVaultClient(fetchTransport());

type Phase =
  | { kind: "reading" }
  | { kind: "no-code" }
  | { kind: "no-vault" }
  | { kind: "asking"; id: string; key: string; deviceName: string; session: VaultSession; words: string }
  | { kind: "done"; deviceName: string }
  | { kind: "refused" }
  | { kind: "failed"; why: string };

/**
 * The phone's side of "Sign in with your phone": a code shown on a computer
 * with no session, scanned here, where the vault is already open.
 *
 * Nothing is sent until the person holding the phone says yes to the name the
 * computer gave. Then the twelve words go sealed under the key in the code —
 * read from the address fragment, never sent — and only the computer that
 * made the code can collect them.
 */
export default function VaultApproveSignIn() {
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const code = readLinkFragment(window.location.hash);
    // The key has been read; the address bar does not need to keep it.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    void (async () => {
      if (!code) {
        setPhase({ kind: "no-code" });
        return;
      }
      const remembered = recallVault();
      if (!remembered) {
        setPhase({ kind: "no-vault" });
        return;
      }
      try {
        const asking = await client.signInRequest(remembered.session.token, code.id);
        if (!cancelled) {
          setPhase({
            kind: "asking",
            id: code.id,
            key: code.key,
            deviceName: asking.deviceName,
            session: remembered.session,
            words: remembered.words,
          });
        }
      } catch (e) {
        if (!cancelled) setPhase({ kind: "failed", why: e instanceof Error ? e.message : "This code no longer works." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const answer = async (allow: boolean) => {
    if (phase.kind !== "asking" || busy) return;
    setBusy(true);
    try {
      if (allow) {
        await client.grantSignIn(phase.session.token, phase.id, sealSeed(phase.words, phase.key, browserRandom));
        setPhase({ kind: "done", deviceName: phase.deviceName });
      } else {
        await client.refuseSignIn(phase.session.token, phase.id);
        setPhase({ kind: "refused" });
      }
    } catch (e) {
      setPhase({ kind: "failed", why: e instanceof Error ? e.message : "The answer did not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 space-y-4 max-w-md">
      <div className="text-sm font-medium">Let a computer into your vault</div>

      {phase.kind === "reading" && <p className="text-xs text-[var(--muted)]">Reading the code…</p>}

      {phase.kind === "asking" && (
        <>
          <p className="text-sm">
            <span className="font-medium">{phase.deviceName}</span> is asking to open your vault
            {phase.session.email ? (
              <>
                {" "}
                (<span className="font-medium">{phase.session.email}</span>)
              </>
            ) : null}
            .
          </p>
          <p className="text-xs text-[var(--muted)]">
            Say yes only if that is the computer in front of you and you just pressed Sign in with your phone on it.
            If someone sent you this code, say no: it would open your vault on their computer.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn" disabled={busy} onClick={() => void answer(true)}>
              Yes, sign it in
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              onClick={() => void answer(false)}
            >
              No
            </button>
          </div>
        </>
      )}

      {phase.kind === "done" && (
        <p className="text-sm text-[var(--green)]">
          {phase.deviceName} is in. It opens your vault now, and appears under Devices, where it can be signed out.
        </p>
      )}

      {phase.kind === "refused" && <p className="text-sm">Refused. That computer was not let in.</p>}

      {phase.kind === "no-vault" && (
        <p className="text-sm">
          Your vault is not open on this phone, so there is nothing here to let a computer into. Open it first — and mark{" "}
          <span className="font-medium">This phone or computer is mine</span>, so it stays open — then scan the code
          again.
        </p>
      )}

      {phase.kind === "no-code" && (
        <p className="text-sm">
          This page opens from the code a computer shows under <span className="font-medium">Sign in with your phone</span>
          . Point this phone&apos;s camera at that code.
        </p>
      )}

      {phase.kind === "failed" && (
        <p role="alert" className="text-sm text-[var(--red)]">
          {phase.why}
        </p>
      )}

      <a href="/vault" className="text-xs text-[var(--accent)]">
        Open my vault
      </a>
    </div>
  );
}
