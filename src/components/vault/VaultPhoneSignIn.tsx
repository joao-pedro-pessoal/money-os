"use client";

import { useEffect, useRef, useState } from "react";
import { browserRandom, createVaultClient, fetchTransport, type VaultSession } from "@/lib/vault/client";
import {
  approveAddress,
  claimHashOf,
  describeDevice,
  LINK_POLL_MS,
  newLinkKey,
  openSeed,
  unreachableFromPhone,
} from "@/lib/vault/link";
import KeepOpenChoice from "./KeepOpenChoice";
import QrCode from "./QrCode";

const client = createVaultClient(fetchTransport());

type Phase =
  | { kind: "idle" }
  | { kind: "unreachable" }
  | { kind: "showing"; id: string; address: string; key: string; claimKey: string; expiresAt: number }
  | { kind: "over"; why: string };

/**
 * "Sign in with your phone": this device has no session, the phone does.
 *
 * The code carries a key this device made and the server never sees. A phone
 * already in the vault scans it, shows this device's name, and on a yes seals
 * its twelve words under that key; this device collects them with a secret of
 * its own, so whoever else reads the code gets nothing. The reverse of "Open on
 * your phone" — see lib/vault/link.ts.
 */
export default function VaultPhoneSignIn({
  onOpen,
  start = false,
}: {
  onOpen: (session: VaultSession, seed: string, keep: boolean) => void;
  /** Make the code straight away, for a page where the person already asked for it. */
  start?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Read when the phone's answer arrives, after the waiting effect has started.
  const keepRef = useRef(keep);
  useEffect(() => {
    keepRef.current = keep;
  }, [keep]);
  // The parent passes a new function each render; waiting must not restart for it.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const waiting = phase.kind === "showing" ? phase : null;

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    let timer: number | undefined;
    const collect = async () => {
      if (cancelled) return;
      setNow(Date.now());
      if (Date.now() > waiting.expiresAt) {
        setPhase({ kind: "over", why: "The code expired. Show a new one when the phone is ready." });
        return;
      }
      try {
        const result = await client.collectSignIn(waiting.id, waiting.claimKey);
        if (cancelled) return;
        if (result === null) {
          timer = window.setTimeout(() => void collect(), LINK_POLL_MS);
          return;
        }
        const words = openSeed(result.sealed, waiting.key);
        const { sealed, ...session } = result;
        void sealed;
        onOpenRef.current(session, words, keepRef.current);
      } catch (e) {
        if (!cancelled) {
          setPhase({ kind: "over", why: e instanceof Error ? e.message : "The phone said no, or the code expired." });
        }
      }
    };
    timer = window.setTimeout(() => void collect(), LINK_POLL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [waiting]);

  const show = async () => {
    if (busy) return;
    setProblem(null);
    if (unreachableFromPhone(window.location.origin)) {
      setPhase({ kind: "unreachable" });
      return;
    }
    setBusy(true);
    try {
      const key = newLinkKey(browserRandom);
      const claimKey = newLinkKey(browserRandom);
      const created = await client.createSignInRequest(describeDevice(navigator.userAgent), claimHashOf(claimKey));
      setNow(Date.now());
      setPhase({
        kind: "showing",
        id: created.id,
        address: approveAddress(window.location.origin, created.id, key),
        key,
        claimKey,
        expiresAt: new Date(created.expiresAt).getTime(),
      });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "No code could be made.");
    } finally {
      setBusy(false);
    }
  };

  // Asked for already: the code is made once, on the first render. A timer
  // rather than a call, so a development double-mount makes one code, not two.
  const showRef = useRef(show);
  useEffect(() => {
    showRef.current = show;
  });
  useEffect(() => {
    if (!start) return;
    const timer = window.setTimeout(() => void showRef.current(), 0);
    return () => window.clearTimeout(timer);
  }, [start]);

  const secondsLeft = waiting ? Math.max(0, Math.round((waiting.expiresAt - now) / 1000)) : 0;

  return (
    <div className="card p-5 space-y-3 max-w-xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Sign in with your phone</div>
          <p className="text-xs text-[var(--muted)]">
            If your vault is open on your phone, scan a code instead of typing your email and password here.
          </p>
        </div>
        {phase.kind !== "showing" && (
          <button type="button" className="btn" disabled={busy} onClick={() => void show()}>
            {busy ? "Making the code…" : phase.kind === "idle" ? "Show a code" : "Show a new code"}
          </button>
        )}
        {phase.kind === "showing" && (
          <button type="button" className="btn" onClick={() => setPhase({ kind: "idle" })}>
            Hide the code
          </button>
        )}
      </div>

      {phase.kind === "unreachable" && (
        <p className="text-xs text-[var(--amber)]">
          This computer opened the site as <span className="font-mono">localhost</span>, which on a phone means the
          phone itself. Open the site here by the address the phone uses, and show the code from there.
        </p>
      )}

      {waiting && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <QrCode text={waiting.address} label="Code to sign this device in from a phone" />
          <div className="text-xs text-[var(--muted)] space-y-2">
            <p>
              <span className="text-[var(--foreground)]">1.</span> On the phone where your vault is open, point the
              camera at the code and open the link.
            </p>
            <p>
              <span className="text-[var(--foreground)]">2.</span> The phone asks whether to let this computer in.
              Say yes there, and this page opens your vault.
            </p>
            <p>Works once, for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} more.</p>
            <KeepOpenChoice keep={keep} onChange={setKeep} />
          </div>
        </div>
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
