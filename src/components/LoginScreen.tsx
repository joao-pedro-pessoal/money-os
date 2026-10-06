"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { recoverAccount, signIn, signUp } from "@/actions/auth";
import { signInKeyFor } from "@/lib/accounts/credentials";
import { passwordProblem } from "@/lib/accounts/password";
import { localeOf } from "@/lib/i18n/languages";
import { serverMessageIn } from "@/lib/i18n/messages";
import { useLanguage } from "./LanguageContext";
import { safeReturnPath } from "@/lib/accounts/returnPath";

type Step = "sign-in" | "sign-up" | "recover" | "code";

/**
 * The way in: signing in, making an account, and getting back into one.
 *
 * The password never leaves this page. It becomes a sign-in key here — a slow
 * scrypt, about a second — and that is what the server checks
 * (lib/accounts/credentials.ts). The one exception is an account from before
 * keys, which the server moves the first time it is signed into: then the
 * password is sent once more, and never again.
 *
 * A new account, a recovered one and the owner's first sign-in each end on the
 * recovery code, shown once: the only way back in without the password.
 */
export default function LoginScreen({ signUps, destination = "/" }: { signUps: boolean; destination?: string }) {
  const router = useRouter();
  const { m, language } = useLanguage();
  const w = m.auth;
  /** What the server or the password check said, in the chosen language when it is a known message. */
  const said = (message: string) => serverMessageIn(m, message);
  const [step, setStep] = useState<Step>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const go = (next: Step) => {
    setStep(next);
    setProblem(null);
    setPassword("");
    setCode("");
  };

  const enter = () => router.replace(safeReturnPath(destination));

  /** Runs one step with the button busy, and says any failure in its own words. */
  const attempt = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : w.unreachable);
    }
    setBusy(false);
  };

  const lockedMessage = (until: string) =>
    w.locked(new Date(until).toLocaleTimeString(localeOf(language), { hour: "2-digit", minute: "2-digit" }));

  const showCode = (value: string) => {
    setRecoveryCode(value);
    setSaved(false);
    setStep("code");
  };

  const signInNow = () =>
    attempt(async () => {
      if (!email.trim() || !password) throw new Error(w.writeEmailAndPassword);
      const signInKey = await signInKeyFor(email, password);
      let outcome = await signIn({ email, signInKey });
      // An account from before keys: its password once, to move it.
      if (outcome.kind === "legacy") outcome = await signIn({ email, signInKey, password });
      switch (outcome.kind) {
        case "ok":
          enter();
          return;
        case "new-code":
          showCode(outcome.recoveryCode);
          return;
        case "legacy":
        case "wrong":
          throw new Error(w.noMatch);
        case "locked":
          throw new Error(lockedMessage(outcome.until));
        case "refused":
          throw new Error(said(outcome.reason));
      }
    });

  const signUpNow = () =>
    attempt(async () => {
      if (!email.trim()) throw new Error(w.writeEmail);
      const weak = passwordProblem(password);
      if (weak) throw new Error(said(weak));
      const outcome = await signUp({ email, signInKey: await signInKeyFor(email, password) });
      if (outcome.kind === "refused") throw new Error(said(outcome.reason));
      showCode(outcome.recoveryCode);
    });

  const recoverNow = () =>
    attempt(async () => {
      if (!email.trim() || !code.trim()) throw new Error(w.writeEmailAndCode);
      const weak = passwordProblem(password);
      if (weak) throw new Error(said(weak));
      const outcome = await recoverAccount({
        email,
        recoveryCode: code,
        signInKey: await signInKeyFor(email, password),
      });
      switch (outcome.kind) {
        case "ok":
          showCode(outcome.recoveryCode);
          return;
        case "wrong":
          throw new Error(w.codeNoMatch);
        case "locked":
          throw new Error(lockedMessage(outcome.until));
        case "refused":
          throw new Error(said(outcome.reason));
      }
    });

  const emailField = (
    <label className="block space-y-1.5">
      <span className="text-sm text-[var(--foreground)]">{w.email}</span>
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

  const passwordField = (label: string, autoComplete: "current-password" | "new-password", hint?: string) => (
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
          aria-label={shown ? w.hidePassword : w.showPassword}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? w.hide : w.show}
        </button>
      </span>
      {hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );

  const problemNotice = problem && (
    <p role="alert" className="text-sm text-[var(--red)]">
      {problem}
    </p>
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

  const submit = (idle: string, working: string) => (
    <button type="submit" className="btn w-full min-h-11" disabled={busy}>
      {busy ? working : idle}
    </button>
  );

  const switchTo = (question: string, label: string, next: Step) => (
    <p className="text-sm text-center text-[var(--muted)]">
      {question}{" "}
      <button type="button" className="text-[var(--accent)] font-medium hover:underline" onClick={() => go(next)}>
        {label}
      </button>
    </p>
  );

  if (step === "code" && recoveryCode) {
    return (
      <>
        <Heading title={w.codeTitle}>{w.codeText}</Heading>
        <p className="card p-4 text-center font-mono text-lg tracking-wider break-all select-all">{recoveryCode}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          {w.savedIt}
        </label>
        <button type="button" className="btn w-full min-h-11" disabled={!saved} onClick={enter}>
          {w.continue}
        </button>
      </>
    );
  }

  if (step === "sign-up") {
    return (
      <>
        <Heading title={w.signUpTitle}>{w.signUpText}</Heading>
        {form(
          signUpNow,
          <>
            {emailField}
            {passwordField(w.password, "new-password", w.newPasswordHint)}
            {problemNotice}
            {submit(w.createMyAccount, w.creating)}
          </>
        )}
        {switchTo(w.haveAccount, w.signIn, "sign-in")}
      </>
    );
  }

  if (step === "recover") {
    return (
      <>
        <Heading title={w.recoverTitle}>{w.recoverText}</Heading>
        {form(
          recoverNow,
          <>
            {emailField}
            <label className="block space-y-1.5">
              <span className="text-sm text-[var(--foreground)]">{w.recoveryCode}</span>
              <input
                className="input auth-input font-mono"
                autoComplete="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
              />
            </label>
            {passwordField(w.newPassword, "new-password", w.atLeast)}
            {problemNotice}
            {submit(w.setPassword, w.setting)}
          </>
        )}
        {switchTo(w.remembered, w.signIn, "sign-in")}
      </>
    );
  }

  return (
    <>
      <Heading title={w.signIn}>{w.signInText}</Heading>
      {form(
        signInNow,
        <>
          {emailField}
          {passwordField(w.password, "current-password")}
          <div className="flex justify-end -mt-2">
            <button type="button" className="text-xs text-[var(--accent)] hover:underline" onClick={() => go("recover")}>
              {w.forgot}
            </button>
          </div>
          {problemNotice}
          {submit(w.signIn, w.signingIn)}
        </>
      )}
      {signUps && switchTo(w.newHere, w.createAnAccount, "sign-up")}
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
