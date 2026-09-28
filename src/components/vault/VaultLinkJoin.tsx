"use client";

import { useEffect, useRef, useState } from "react";
import { browserRandom, createVaultClient, fetchTransport } from "@/lib/vault/client";
import {
  claimHashOf,
  describeDevice,
  LINK_POLL_MS,
  LINK_SECONDS,
  newLinkKey,
  openSeed,
  readLinkFragment,
} from "@/lib/vault/link";
import KeepOpenChoice from "./KeepOpenChoice";
import { rememberVault } from "./storage";

const client = createVaultClient(fetchTransport());

type Phase =
  | { kind: "reading" }
  | { kind: "no-code" }
  | { kind: "asking" }
  | { kind: "waiting"; deviceName: string }
  | { kind: "failed"; why: string };

/**
 * The phone's side of a scanned code.
 *
 * It asks in under its own name and a secret only it holds, then waits for the
 * yes on the other device. The key in the address is read once and wiped from
 * the address bar, so it does not linger in this phone's history; it opens the
 * sealed words when they arrive and is never sent anywhere.
 */
export default function VaultLinkJoin() {
  const [phase, setPhase] = useState<Phase>({ kind: "reading" });
  const [keep, setKeep] = useState(true);
  // Read when the answer arrives, which is after the effect below has started.
  const keepRef = useRef(keep);
  useEffect(() => {
    keepRef.current = keep;
  }, [keep]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const code = readLinkFragment(window.location.hash);
    // The key has been read; the address bar does not need to keep it.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    void (async () => {
      if (!code) {
        setPhase({ kind: "no-code" });
        return;
      }
      setPhase({ kind: "asking" });
      const claimKey = newLinkKey(browserRandom);
      const deviceName = describeDevice(navigator.userAgent);
      try {
        await client.askLink(code.id, deviceName, claimHashOf(claimKey));
      } catch (e) {
        if (!cancelled) setPhase({ kind: "failed", why: e instanceof Error ? e.message : "This code no longer works." });
        return;
      }
      if (cancelled) return;
      setPhase({ kind: "waiting", deviceName });

      const giveUpAt = Date.now() + LINK_SECONDS * 1000;
      const collect = async () => {
        try {
          const result = await client.collectLink(code.id, claimKey);
          if (cancelled) return;
          if (result === null) {
            if (Date.now() > giveUpAt) {
              setPhase({ kind: "failed", why: "Nobody answered on the other device in time. Show a new code there." });
            } else {
              timer = window.setTimeout(() => void collect(), LINK_POLL_MS);
            }
            return;
          }
          const words = openSeed(result.sealed, code.key);
          rememberVault({ token: result.token, userId: result.userId, deviceId: result.deviceId }, words, keepRef.current);
          window.location.replace("/vault");
        } catch (e) {
          if (!cancelled) {
            setPhase({
              kind: "failed",
              why: e instanceof Error ? e.message : "The other device said no, or the code expired.",
            });
          }
        }
      };
      timer = window.setTimeout(() => void collect(), LINK_POLL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="card p-5 space-y-4 max-w-md">
      <div className="text-sm font-medium">Opening your vault on this phone</div>

      {phase.kind === "reading" || phase.kind === "asking" ? (
        <p className="text-xs text-[var(--muted)]">Reading the code…</p>
      ) : null}

      {phase.kind === "waiting" && (
        <>
          <p className="text-sm">
            Now say yes on the other device. It shows this phone as{" "}
            <span className="font-medium">{phase.deviceName}</span>.
          </p>
          <KeepOpenChoice keep={keep} onChange={setKeep} />
          <p className="text-xs text-[var(--muted)]">Waiting for the answer…</p>
        </>
      )}

      {phase.kind === "no-code" && (
        <p className="text-sm">
          This page opens from the code shown on a computer where your vault is open: there, press{" "}
          <span className="font-medium">Open on your phone</span> and point this phone&apos;s camera at the code. Or{" "}
          <a href="/vault" className="text-[var(--accent)]">
            sign in here
          </a>{" "}
          with your address, password and twelve words.
        </p>
      )}

      {phase.kind === "failed" && (
        <>
          <p role="alert" className="text-sm text-[var(--red)]">
            {phase.why}
          </p>
          <a href="/vault" className="text-xs text-[var(--accent)]">
            Sign in here instead
          </a>
        </>
      )}
    </div>
  );
}
