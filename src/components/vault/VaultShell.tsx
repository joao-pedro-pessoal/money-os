"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthFrame from "../AuthFrame";
import TopBar from "../TopBar";
import VaultNav from "./VaultNav";
import VaultCreate from "./VaultCreate";
import VaultSeedPrompt from "./VaultSeedPrompt";
import { forgetVault, isKept, recallVault, rememberVault } from "./storage";

const client = createVaultClient(fetchTransport());

export interface OpenVaultState {
  session: VaultSession;
  seed: string;
  document: VaultDocument;
  /** What the last save or open said, for the pages to show. */
  status: string | null;
  save: (next: VaultDocument, what: string) => void;
  /** Bumped when a phone joins, so the device list reads again. */
  joined: number;
  onJoined: () => void;
}

const VaultContext = createContext<OpenVaultState | null>(null);

/** The open vault, for its pages. Only rendered inside one, so never null there. */
export function useVault(): OpenVaultState {
  const vault = useContext(VaultContext);
  if (!vault) throw new Error("useVault is only available inside an open vault.");
  return vault;
}

/**
 * A vault account on the site, from signing in to every save — and the frame
 * its pages sit in, the same one the owner's pages do.
 *
 * Where the two secrets live is the whole design, and it is in `storage.ts`:
 * the session token outlives the visit and unlocks nothing; the twelve words
 * last only the visit unless the person says this device is theirs. Neither is
 * ever sent; the server sees a token and ciphertext.
 *
 * The document is opened once here and kept while moving between the vault's
 * pages: they are client-side navigations inside this layout, so nothing is
 * decrypted twice and nothing decrypted is ever sent anywhere.
 *
 * Saving is immediate and one version at a time. A save that would land on top
 * of a newer version from another device stops and says so, because the other
 * device recorded something real.
 */
export default function VaultShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<VaultSession | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [document, setDocument] = useState<VaultDocument | null>(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** A Google sign-in that has an account but not yet the words that open it. */
  const [awaitingSeed, setAwaitingSeed] = useState<{ session: VaultSession; isNew: boolean } | null>(null);
  const [joined, setJoined] = useState(0);
  /** Came from "Create your vault" on the sign-in page. */
  const [startNew, setStartNew] = useState(false);
  const saving = useRef(false);
  const router = useRouter();
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
      if (address.searchParams.get("new") === "1" && !cancelled) setStartNew(true);
      if (address.searchParams.has("google") || googleProblem || address.searchParams.has("new")) {
        address.searchParams.delete("google");
        address.searchParams.delete("google_error");
        address.searchParams.delete("new");
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
          if (!cancelled) {
            setAwaitingSeed({
              session: { token: body.token, userId: body.userId, deviceId: body.deviceId },
              isNew: body.isNew,
            });
          }
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

  const lock = () => {
    forgetVault();
    // Back to the sign-in page, not to the form this vault was created from.
    setStartNew(false);
    setSession(null);
    setSeed(null);
    setDocument(null);
    setVersion(0);
    setStatus(null);
  };

  // Nothing open, nothing to finish and nothing to say: the way in is the
  // sign-in page. "Create your vault" arrives with ?new=1 and stays here.
  const leaving = !loading && !awaitingSeed && !session && !startNew && !problem;
  useEffect(() => {
    if (leaving) router.replace("/login");
  }, [leaving, router]);

  const problemNotice = problem && (
    <p role="alert" className="card p-3 text-sm text-[var(--red)]">
      {problem}
    </p>
  );

  // Before a vault is open there is nothing to move between, so no menu: the
  // same frame as the sign-in page instead. Signing in is that page's; this
  // one creates a vault, finishes a Google sign-in, or says what went wrong.
  if (loading || awaitingSeed || !session || !document || !seed) {
    return (
      <AuthFrame>
        <header className="space-y-2">
          <h1 className="text-3xl tracking-tight text-[var(--foreground)]">Your vault</h1>
          <p className="text-sm text-[var(--muted)]">
            An account of your own on this Money OS. What you record is encrypted on this device before it is stored,
            as something the server — and whoever runs it — cannot read.
          </p>
        </header>
        {problemNotice}
        {loading || leaving ? (
          <p className="text-sm text-[var(--muted)]">Opening…</p>
        ) : awaitingSeed ? (
          <VaultSeedPrompt
            isNew={awaitingSeed.isNew}
            onReady={(words, keep) => {
              const waiting = awaitingSeed;
              setAwaitingSeed(null);
              void open(waiting.session, words, keep);
            }}
            onCancel={() => setAwaitingSeed(null)}
          />
        ) : (
          startNew && <VaultCreate onOpen={(next, words, keep) => void open(next, words, keep)} />
        )}
        <p className="text-sm text-center text-[var(--muted)]">
          <Link href="/login" className="text-[var(--accent)] font-medium">
            Back to sign in
          </Link>
        </p>
      </AuthFrame>
    );
  }

  return (
    <div className="app-frame flex">
      <VaultNav email={session.email} onLock={lock} />
      <div id="app-content" className="flex-1 min-w-0 flex flex-col">
        {/* The owner's top bar: menu, hide values, light and dark. No alerts —
            those are read from the owner's records. */}
        <TopBar alerts={[]} />
        <main className="app-main flex-1 p-4 md:p-8 max-w-5xl space-y-4">
          {problemNotice}
          <VaultContext.Provider
            value={{ session, seed, document, status, save: (next, what) => void save(next, what), joined, onJoined }}
          >
            {children}
          </VaultContext.Provider>
        </main>
      </div>
    </div>
  );
}
