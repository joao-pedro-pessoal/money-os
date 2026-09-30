"use client";

import { useEffect, useRef, useState } from "react";
import { browserRandom, createVaultClient, fetchTransport, type VaultSession } from "@/lib/vault/client";
import {
  LINK_POLL_MS,
  linkAddress,
  newLinkKey,
  sealSeed,
  unreachableFromPhone,
} from "@/lib/vault/link";
import QrCode from "./QrCode";

const client = createVaultClient(fetchTransport());

type Phase =
  | { kind: "idle" }
  | { kind: "unreachable" }
  | { kind: "showing"; id: string; address: string; expiresAt: number }
  | { kind: "asked"; id: string; deviceName: string; expiresAt: number }
  | { kind: "approved"; id: string }
  | { kind: "joined"; deviceName: string }
  | { kind: "over"; why: string };

/**
 * "Open on your phone": a code on this screen that lets a phone in.
 *
 * This device already holds the session and the twelve words. It seals the
 * words under a key of its own, stores only what it sealed, and shows the key
 * in the code. A phone that scans it asks in by name, and nothing is handed
 * over until someone here answers — see lib/vault/link.ts for each step.
 *
 * Hiding the code ends it on the server at once, rather than leaving it valid
 * for the rest of its minutes.
 */
export default function VaultPhoneLink({
  session,
  seed,
  onJoined,
}: {
  session: VaultSession;
  seed: string;
  onJoined: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const answering = useRef(false);
  /**
   * One code at a time. Each new code deletes the account's last one, so a
   * double click made two, and when the answers crossed the page showed the
   * deleted one — "expired" a second after it appeared.
   */
  const creating = useRef(false);
  const [busy, setBusy] = useState(false);

  const linkId = phase.kind === "showing" || phase.kind === "asked" || phase.kind === "approved" ? phase.id : null;
  const expiresAt = phase.kind === "showing" || phase.kind === "asked" ? phase.expiresAt : null;

  // While a code is out, ask every couple of seconds how it is going.
  useEffect(() => {
    if (!linkId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await client.linkStatus(session.token, linkId);
        if (cancelled) return;
        setNow(Date.now());
        if (status.state === "asked") {
          setPhase((current) =>
            current.kind === "showing"
              ? { kind: "asked", id: linkId, deviceName: status.deviceName ?? "A device", expiresAt: current.expiresAt }
              : current
          );
        } else if (status.state === "collected") {
          setPhase((current) => ({
            kind: "joined",
            deviceName: current.kind === "asked" ? current.deviceName : (status.deviceName ?? "The phone"),
          }));
          onJoined();
        } else if (status.state === "expired" || status.state === "gone") {
          setPhase({
            kind: "over",
            why: "This code no longer works: it expired, or a newer one was shown elsewhere. Show a new one when the phone is ready.",
          });
        }
      } catch {
        // A missed check is retried on the next tick.
      }
    };
    const timer = window.setInterval(() => void tick(), LINK_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [linkId, session.token, onJoined]);

  const show = async () => {
    if (creating.current) return;
    setProblem(null);
    if (unreachableFromPhone(window.location.origin)) {
      setPhase({ kind: "unreachable" });
      return;
    }
    creating.current = true;
    setBusy(true);
    try {
      const key = newLinkKey(browserRandom);
      const created = await client.createLink(session.token, sealSeed(seed, key, browserRandom));
      setNow(Date.now());
      setPhase({
        kind: "showing",
        id: created.id,
        address: linkAddress(window.location.origin, created.id, key),
        expiresAt: new Date(created.expiresAt).getTime(),
      });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "No code could be made.");
    } finally {
      creating.current = false;
      setBusy(false);
    }
  };

  const answer = async (allow: boolean) => {
    if (!linkId || answering.current) return;
    answering.current = true;
    setProblem(null);
    try {
      await client.answerLink(session.token, linkId, allow);
      setPhase(allow ? { kind: "approved", id: linkId } : { kind: "over", why: "Refused. That device was not let in." });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The answer did not reach the server.");
    } finally {
      answering.current = false;
    }
  };

  const hide = () => {
    // Ends the code on the server too; a hidden code should not still work.
    if (linkId) void client.answerLink(session.token, linkId, false).catch(() => undefined);
    setPhase({ kind: "idle" });
  };

  const secondsLeft = expiresAt === null ? 0 : Math.max(0, Math.round((expiresAt - now) / 1000));

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Open on your phone</div>
          <p className="text-xs text-[var(--muted)]">
            Scan a code with the phone&apos;s camera instead of typing the address, your email and your password.
          </p>
        </div>
        {phase.kind === "idle" || phase.kind === "over" || phase.kind === "joined" || phase.kind === "unreachable" ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void show()}>
            {busy ? "Making the code…" : phase.kind === "idle" ? "Show the code" : "Show a new code"}
          </button>
        ) : (
          <button type="button" className="btn" onClick={hide}>
            Hide the code
          </button>
        )}
      </div>

      {phase.kind === "unreachable" && (
        <p className="text-xs text-[var(--amber)]">
          This computer opened the site as <span className="font-mono">localhost</span>, which on a phone means the
          phone itself. Open the site here by the address the phone uses — the Vercel one, or this computer&apos;s
          network address — and show the code from there.
        </p>
      )}

      {phase.kind === "showing" && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <QrCode text={phase.address} label="Code to open this vault on a phone" />
          <div className="text-xs text-[var(--muted)] space-y-2 max-w-sm">
            <p>
              <span className="text-[var(--foreground)]">1.</span> Point the phone&apos;s camera at the code and open
              the link it shows.
            </p>
            <p>
              <span className="text-[var(--foreground)]">2.</span> The phone asks to come in, and you say yes here.
              Nothing opens until you do.
            </p>
            <p>Works once, for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} more.</p>
            <p>
              Only show it to your own phone: the code carries what opens the vault, and the yes here is what stops
              anyone who photographs it.
            </p>
          </div>
        </div>
      )}

      {phase.kind === "asked" && (
        <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: "var(--accent)" }}>
          <p className="text-sm">
            <span className="font-medium">{phase.deviceName}</span> scanned the code and wants to open your vault.
          </p>
          <p className="text-xs text-[var(--muted)]">
            Say yes only if that is the phone in your hand right now. If it is not, someone else saw the code: refuse.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn" onClick={() => void answer(true)}>
              Yes, let it in
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              onClick={() => void answer(false)}
            >
              No
            </button>
          </div>
        </div>
      )}

      {phase.kind === "approved" && <p className="text-xs text-[var(--muted)]">Letting the phone in…</p>}

      {phase.kind === "joined" && (
        <p className="text-xs text-[var(--green)]">
          {phase.deviceName} is in. It is listed under Devices below, where it can be signed out at any time.
        </p>
      )}

      {phase.kind === "over" && <p className="text-xs text-[var(--muted)]">{phase.why}</p>}

      {problem && (
        <p role="alert" className="text-xs text-[var(--red)]">
          {problem}
        </p>
      )}
    </div>
  );
}
