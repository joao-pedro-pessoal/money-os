"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserRandom,
  createVaultClient,
  fetchTransport,
  openDocument,
  sealDocument,
  VaultClientError,
  type VaultSession,
} from "@/lib/vault/client";
import { emptyDocument, type VaultDocument } from "@/lib/vault/document";
import VaultLedger from "./VaultLedger";
import VaultSignIn from "./VaultSignIn";
import VaultBringIn from "./VaultBringIn";
import VaultSeedPrompt from "./VaultSeedPrompt";
import VaultPhoneLink from "./VaultPhoneLink";
import VaultDevices from "./VaultDevices";
import { forgetVault, isKept, recallVault, rememberVault } from "./storage";

const client = createVaultClient(fetchTransport());

/**
 * A vault account on the site, from signing in to every save.
 *
 * Where the two secrets live is the whole design, and it is in `storage.ts`:
 * the session token outlives the visit and unlocks nothing; the twelve words
 * last only the visit unless the person says this device is theirs. Neither is
 * ever sent; the server sees a token and ciphertext.
 *
 * Saving is immediate and one version at a time. A save that would land on top
 * of a newer version from another device stops and says so, because the other
 * device recorded something real.
 */
export default function VaultApp() {
  const [session, setSession] = useState<VaultSession | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [document, setDocument] = useState<VaultDocument | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** A Google sign-in that has an account but not yet the words that open it. */
  const [awaitingSeed, setAwaitingSeed] = useState<{ session: VaultSession; isNew: boolean } | null>(null);
  /** Bumped when a phone joins, so the device list reads again. */
  const [joined, setJoined] = useState(0);
  const saving = useRef(false);
  const onJoined = useCallback(() => setJoined((n) => n + 1), []);

  /**
   * Opens what the server holds, or starts an empty vault for a new account.
   * `keep` is the person's answer on this visit; reopening leaves it as it was.
   */
  const open = useCallback(async (current: VaultSession, words: string, keep?: boolean) => {
    setLoading(true);
    setProblem(null);
    try {
      const stored = await client.fetchVault(current.token);
      if (!stored) {
        setDocument(emptyDocument("EUR"));
        setVersion(0);
        setStatus("New vault — nothing saved yet");
      } else {
        const opened = openDocument({ text: stored.text, seed: words, userId: current.userId });
        setDocument(opened.document);
        setVersion(opened.version);
        setStatus(`Opened version ${opened.version}`);
      }
      setSession(current);
      setSeed(words);
      rememberVault(current, words, keep ?? isKept());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The vault could not be opened.");
      setDocument(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Back on this device: the token is still here, and the words are too while
  // the tab lives, or for good on a device kept open. Either one missing means
  // signing in again — and a return from Google leaves a session waiting to be
  // claimed, once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const address = new URL(window.location.href);
      const googleProblem = address.searchParams.get("google_error");
      if (googleProblem && !cancelled) setProblem(googleProblem);
      if (address.searchParams.has("google") || googleProblem) {
        address.searchParams.delete("google");
        address.searchParams.delete("google_error");
        window.history.replaceState(window.history.state, "", address);
      }

      const remembered = recallVault();
      if (remembered) {
        await open(remembered.session, remembered.words);
        return;
      }

      try {
        const claimed = await fetch("/api/vault/google/claim", { method: "POST", cache: "no-store" });
        if (claimed.ok) {
          const body = (await claimed.json()) as VaultSession & { isNew: boolean };
          if (!cancelled) setAwaitingSeed({ session: { token: body.token, userId: body.userId, deviceId: body.deviceId }, isNew: body.isNew });
        }
      } catch {
        // No sign-in waiting, which is the ordinary case.
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async (next: VaultDocument, what: string) => {
    if (!session || !seed || saving.current) return;
    saving.current = true;
    setDocument(next);
    setStatus("Saving…");
    try {
      const sealed = await sealDocument({
        document: next,
        seed,
        userId: session.userId,
        version,
        random: browserRandom,
      });
      const stored = await client.putVault(session.token, sealed);
      setVersion(stored);
      setStatus(`${what} · saved`);
      setProblem(null);
    } catch (e) {
      const conflict = e instanceof VaultClientError && e.kind === "conflict";
      setProblem(
        conflict
          ? "Another device saved a newer vault while you were working. Reload this page to read it, then record this again."
          : e instanceof Error
            ? e.message
            : "It could not be saved."
      );
      setStatus(null);
    } finally {
      saving.current = false;
    }
  };

  const signOut = () => {
    forgetVault();
    setSession(null);
    setSeed(null);
    setDocument(null);
    setVersion(0);
    setStatus(null);
  };

  if (loading) return <p className="text-sm text-[var(--muted)]">Opening…</p>;

  if (awaitingSeed) {
    return (
      <div className="space-y-4">
        {problem && (
          <p role="alert" className="card p-3 text-sm text-[var(--red)]">
            {problem}
          </p>
        )}
        <VaultSeedPrompt
          isNew={awaitingSeed.isNew}
          onReady={(words, keep) => {
            const waiting = awaitingSeed;
            setAwaitingSeed(null);
            void open(waiting.session, words, keep);
          }}
          onCancel={() => setAwaitingSeed(null)}
        />
      </div>
    );
  }

  if (!session || !document) {
    return (
      <div className="space-y-4">
        {problem && (
          <p role="alert" className="card p-3 text-sm text-[var(--red)]">
            {problem}
          </p>
        )}
        <VaultSignIn onOpen={(next, words, keep) => void open(next, words, keep)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-[var(--muted)]">
          Your own vault. Everything here is encrypted in this page before it is stored, so whoever runs this site
          cannot read it — and cannot recover it for you either.
        </p>
        <button type="button" className="btn" onClick={signOut}>
          Lock and sign out
        </button>
      </div>
      {problem && (
        <p role="alert" className="card p-3 text-sm text-[var(--red)]">
          {problem}
        </p>
      )}
      {/* Near the top on a computer, where it is the way to the phone; left out
          on a phone's width, where it would be the phone offering itself. */}
      {seed && (
        <div className="hidden sm:block">
          <VaultPhoneLink session={session} seed={seed} onJoined={onJoined} />
        </div>
      )}
      <VaultBringIn document={document} onBring={(next) => void save(next, "records brought in")} />
      <VaultLedger document={document} onChange={(next, what) => void save(next, what)} saving={status} />
      <VaultDevices session={session} refresh={joined} />
    </div>
  );
}
