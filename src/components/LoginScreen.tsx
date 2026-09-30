"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/app/login/actions";
import { describeDevice } from "@/lib/vault/link";
import VaultPhoneSignIn from "./vault/VaultPhoneSignIn";
import { holdSignedIn, rememberVault } from "./vault/storage";

/**
 * The sign-in form: one email and one password for everyone.
 *
 * The owner lands on the site. Anyone else lands in their vault, which still
 * asks for the twelve words — they are never typed here, and never sent.
 * Which of the two an email is, the server decides (lib/signInRoute.ts); this
 * page only learns where to go next.
 */
export default function LoginScreen({ google }: { google: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setProblem("Write your email and your password.");
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const outcome = await signIn({ email, password, deviceName: describeDevice(navigator.userAgent) });
      switch (outcome.kind) {
        case "owner":
          router.replace("/");
          return;
        case "vault":
          holdSignedIn(outcome.session);
          router.replace("/vault");
          return;
        case "wrong":
          setProblem("That email and password do not match.");
          break;
        case "locked":
          setProblem(
            `Too many wrong passwords. Signing in opens again at ${new Date(outcome.until).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}.`
          );
          break;
        case "refused":
          setProblem(outcome.reason);
          break;
      }
    } catch {
      setProblem("The server could not be reached. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-3xl tracking-tight text-[var(--foreground)]">Sign in</h1>
        <p className="text-sm text-[var(--muted)]">
          With your email and password — the same page for the owner and for everyone with a vault here.
        </p>
      </div>

      {phone ? (
        <div className="space-y-3">
          <VaultPhoneSignIn
            start
            onOpen={(session, words, keep) => {
              rememberVault(session, words, keep);
              router.replace("/vault");
            }}
          />
          <button type="button" className="btn-quiet" onClick={() => setPhone(false)}>
            Back to email and password
          </button>
        </div>
      ) : (
        <>
          {/*
            POST, and to this page: if the script never runs, the browser sends
            the form itself, and a form with no method sends it as a GET — the
            password in the address, the history and the server's logs.
          */}
          <form method="post" action="/login" onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
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
            <label className="block space-y-1.5">
              <span className="text-sm text-[var(--foreground)]">Password</span>
              <span className="relative block">
                <input
                  className="input auth-input pr-16"
                  type={shown ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
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

            {problem && (
              <p role="alert" className="text-sm text-[var(--red)]">
                {problem}
              </p>
            )}

            <button type="submit" className="btn w-full min-h-11" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

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
              <button type="button" className="btn-quiet" onClick={() => setPhone(true)}>
                <PhoneMark />
                Sign in with your phone
              </button>
            </div>
          </div>
        </>
      )}

      <p className="text-sm text-center text-[var(--muted)]">
        New here?{" "}
        <Link href="/vault?new=1" className="text-[var(--accent)] font-medium">
          Create your vault
        </Link>
      </p>
    </>
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
