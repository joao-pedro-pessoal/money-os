"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/app/login/actions";
import type { VaultSession } from "@/lib/vault/client";
import { passwordKeys, unsealWords } from "@/lib/vault/credentials";
import { describeDevice } from "@/lib/vault/link";
import { passwordProblem } from "@/lib/vault/password";
import { isValidSeed } from "@/lib/vault/seed";
import KeepOpenChoice from "./vault/KeepOpenChoice";
import VaultPhoneSignIn from "./vault/VaultPhoneSignIn";
import { moveOlderVault, recoverPasswordVault } from "./vault/passwordVault";
import { rememberVault } from "./vault/storage";

type Step = "sign-in" | "words" | "recover" | "phone";

const deviceName = () => describeDevice(navigator.userAgent);

/**
 * The sign-in page: an email and a password, for everyone.
 *
 * The owner lands on the site; anyone else in their vault, opened on the spot.
 * The password never leaves this page — it becomes a sign-in key for the
 * server and a key that unseals the vault's twelve words here
 * (lib/vault/credentials.ts). Which of the two an email is, the server
 * decides (lib/signInRoute.ts).
 *
 * The words are typed in two cases only: once, for a vault made before they
 * were kept sealed; and to set a new password when the old one is forgotten.
 */
export default function LoginScreen({ google }: { google: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [words, setWords] = useState("");
  const [shown, setShown] = useState(false);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const go = (next: Step) => {
    setStep(next);
    setProblem(null);
    setWords("");
  };

  const openVault = (session: VaultSession, vaultWords: string) => {
    rememberVault(session, vaultWords, keep);
    router.replace("/vault");
  };

  /** Runs one step, with the button busy and any failure said in its own words. */
  const attempt = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The server could not be reached. Try again in a moment.");
    }
    setBusy(false);
  };

  const signInNow = () =>
    attempt(async () => {
      if (!email.trim() || !password) throw new Error("Write your email and your password.");
      const keys = await passwordKeys(email, password);
      try {
        const outcome = await signIn({ email, signInKey: keys.signInKey, deviceName: deviceName() });
        switch (outcome.kind) {
          case "owner":
            router.replace("/");
            return;
          case "vault":
            openVault(outcome.session, unsealWords(outcome.sealedWords, keys.sealKey));
            return;
          case "needs-words":
            go("words");
            return;
          case "wrong":
            throw new Error("That email and password do not match.");
          case "locked":
            throw new Error(
              `Too many wrong passwords. Signing in opens again at ${new Date(outcome.until).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}.`
            );
          case "refused":
            throw new Error(outcome.reason);
        }
      } finally {
        keys.sealKey.fill(0);
      }
    });

  const moveNow = () =>
    attempt(async () => {
      if (!isValidSeed(words)) throw new Error("Those are not the twelve words of a recovery seed.");
      const session = await moveOlderVault(email, password, words.trim(), deviceName());
      openVault(session, words.trim());
    });

  const recoverNow = () =>
    attempt(async () => {
      if (!email.trim()) throw new Error("Write the email of your vault.");
      if (!isValidSeed(words)) throw new Error("Those are not the twelve words of a recovery seed.");
      const weak = passwordProblem(password);
      if (weak) throw new Error(weak);
      const session = await recoverPasswordVault(email, words.trim(), password, deviceName());
      openVault(session, words.trim());
    });

  const emailField = (
    <label className="block space-y-1.5">
      <span className="text-sm text-[var(--foreground)]">Email</span>
      <input
        className="input auth-input"
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </label>
  );

  const passwordField = (label: string, autoComplete: "current-password" | "new-password") => (
    <label className="block space-y-1.5">
      <span className="text-sm text-[var(--foreground)]">{label}</span>
      <span className="relative block">
        <input
          className="input auth-input pr-16"
          type={shown ? "text" : "password"}
          name="password"
          autoComplete={autoComplete}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 px-3 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-pressed={shown}
          aria-label={shown ? "Hide the password" : "Show the password"}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );

  const wordsField = (
    <label className="block space-y-1.5">
      <span className="text-sm text-[var(--foreground)]">Your twelve words</span>
      <textarea
        className="input auth-input"
        rows={3}
        autoComplete="off"
        spellCheck={false}
        autoFocus={step === "words"}
        value={words}
        onChange={(e) => setWords(e.target.value)}
        placeholder="word word word …"
      />
    </label>
  );

  const problemNotice = problem && (
    <p role="alert" className="text-sm text-[var(--red)]">
      {problem}
    </p>
  );

  const back = (
    <button type="button" className="btn-quiet" onClick={() => go("sign-in")}>
      Back to sign in
    </button>
  );

  /*
   * Each form posts to this page if its script never runs: a form with no
   * method would send the password as a GET — in the address, the history and
   * the server's logs.
   */
  const form = (onSubmit: () => void, children: React.ReactNode) => (
    <form
      method="post"
      action="/login"
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      {children}
    </form>
  );

  if (step === "phone") {
    return (
      <>
        <Heading title="Sign in with your phone" />
        <VaultPhoneSignIn start onOpen={(session, vaultWords, keepHere) => {
          rememberVault(session, vaultWords, keepHere);
          router.replace("/vault");
        }} />
        {back}
      </>
    );
  }

  if (step === "words") {
    return (
      <>
        <Heading title="One more step">
          This vault was made before signing in with a password alone. Type its twelve words once — from then on,
          your email and password are enough, here and on every device.
        </Heading>
        {form(moveNow, (
          <>
            {wordsField}
            {problemNotice}
            <button type="submit" className="btn w-full min-h-11" disabled={busy}>
              {busy ? "Opening…" : "Open my vault"}
            </button>
          </>
        ))}
        {back}
      </>
    );
  }

  if (step === "recover") {
    return (
      <>
        <Heading title="A new password">
          Your twelve words prove the vault is yours. Choose a new password; the words stay the same, and still open
          it if you forget this one too.
        </Heading>
        {form(recoverNow, (
          <>
            {emailField}
            {wordsField}
            {passwordField("New password", "new-password")}
            <KeepOpenChoice keep={keep} onChange={setKeep} />
            {problemNotice}
            <button type="submit" className="btn w-full min-h-11" disabled={busy}>
              {busy ? "Setting it…" : "Set the new password"}
            </button>
            <p className="text-xs text-[var(--muted)]">
              For vaults only. The owner&apos;s password is set where this site is set up.
            </p>
          </>
        ))}
        {back}
      </>
    );
  }

  return (
    <>
      <Heading title="Sign in">With your email and password.</Heading>

      {form(signInNow, (
        <>
          {emailField}
          {passwordField("Password", "current-password")}
          <div className="flex justify-end -mt-2">
            <button
              type="button"
              className="text-xs text-[var(--accent)] hover:underline"
              onClick={() => {
                setPassword("");
                go("recover");
              }}
            >
              Forgot your password?
            </button>
          </div>
          <KeepOpenChoice keep={keep} onChange={setKeep} />
          {problemNotice}
          <button type="submit" className="btn w-full min-h-11" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </>
      ))}

      <div className="auth-divider">or</div>

      <div className="space-y-2">
        {google && (
          <a className="btn-quiet" href="/api/vault/google/start">
            <GoogleMark />
            Continue with Google
          </a>
        )}
        {/* On a computer only: on a phone it would be showing the code to itself.
            The wrapper hides it, since .btn-quiet sets its own display. */}
        <div className="hidden sm:block">
          <button type="button" className="btn-quiet" onClick={() => go("phone")}>
            <PhoneMark />
            Sign in with your phone
          </button>
        </div>
      </div>

      <p className="text-sm text-center text-[var(--muted)]">
        New here?{" "}
        <Link href="/vault?new=1" className="text-[var(--accent)] font-medium">
          Create your vault
        </Link>
      </p>
    </>
  );
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="text-3xl tracking-tight text-[var(--foreground)]">{title}</h1>
      {children && <p className="text-sm text-[var(--muted)]">{children}</p>}
    </div>
  );
}

function PhoneMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
