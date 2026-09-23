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

const client = createVaultClient(fetchTransport());
const SESSION_KEY = "money-os-vault-session";
const SEED_KEY = "money-os-vault-seed";

/**
 * A vault account on the site, from signing in to every save.
 *
 * Where the two secrets live is the whole design. The session token goes in
 * `localStorage`, so the account stays signed in on this device — it proves who
 * the account is and unlocks nothing. The twelve words go in `sessionStorage`,
 * which the browser drops when the tab closes: they decrypt the money records,
 * and a key that outlives the tab is a key left in the door of a shared
 * computer. Neither is ever sent; the server sees a token and ciphertext.
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
  const saving = useRef(false);

  /** Opens what the server holds, or starts an empty vault for a new account. */
  const open = useCallback(async (current: VaultSession, words: string) => {
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
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(current));
      window.sessionStorage.setItem(SEED_KEY, words);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The vault could not be opened.");
      setDocument(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Back on this device: the token is still here, and the words are too while
  // the tab lives. Either one missing means signing in again.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw = window.localStorage.getItem(SESSION_KEY);
      const words = window.sessionStorage.getItem(SEED_KEY);
      if (raw && words) {
        try {
          await open(JSON.parse(raw) as VaultSession, words);
          return;
        } catch {
          // A stored session that no longer parses is one to sign in again for.
        }
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
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SEED_KEY);
    setSession(null);
    setSeed(null);
    setDocument(null);
    setVersion(0);
    setStatus(null);
  };

  if (loading) return <p className="text-sm text-[var(--muted)]">Opening…</p>;

  if (!session || !document) {
    return (
      <div className="space-y-4">
        {problem && (
          <p role="alert" className="card p-3 text-sm text-[var(--red)]">
            {problem}
          </p>
        )}
        <VaultSignIn onOpen={(next, words) => void open(next, words)} />
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
      <VaultLedger document={document} onChange={(next, what) => void save(next, what)} saving={status} />
    </div>
  );
}
