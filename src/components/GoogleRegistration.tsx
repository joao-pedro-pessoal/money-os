"use client";
import { useRef, useState } from "react";
import { useLanguage } from "./LanguageContext";
import { googleText } from "@/lib/accounts/googleText";
import { GOOGLE_REGISTER_PATH } from "@/lib/accounts/google";
import { safeReturnPath } from "@/lib/accounts/returnPath";

export default function GoogleRegistration({ email, taken, signUps, inviteRequired }: { email: string; taken: boolean; signUps: boolean; inviteRequired: boolean }) {
  const { language } = useLanguage(); const text = googleText(language);
  const [inviteCode, setInviteCode] = useState(""); const [website, setWebsite] = useState("");
  const [agreed, setAgreed] = useState(false); const [saved, setSaved] = useState(false);
  const [code, setCode] = useState(""); const [destination, setDestination] = useState("/");
  const [problem, setProblem] = useState(""); const [busy, setBusy] = useState(false); const pending = useRef(false);
  const create = async () => {
    if (!agreed || pending.current) return;
    pending.current = true; setBusy(true); setProblem("");
    try {
      const response = await fetch(GOOGLE_REGISTER_PATH, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteCode, website }) });
      const result = await response.json();
      if (!response.ok || result.kind !== "ok" || typeof result.recoveryCode !== "string") throw new Error(result.error ?? "Google sign-in failed. Start again.");
      setCode(result.recoveryCode); setDestination(safeReturnPath(result.destination));
    } catch (error) { setProblem(error instanceof Error ? error.message : "Google sign-in failed. Start again."); }
    finally { pending.current = false; setBusy(false); }
  };
  if (code) return <div className="space-y-4">
    <h1 className="text-2xl">{text("Save your recovery code")}</h1>
    <p className="text-sm">{text("Keep it somewhere safe. It lets you recover Money OS if you lose access to Google.")}</p>
    <p className="card p-4 font-mono break-all select-all">{code}</p>
    <label className="flex gap-2"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />{text("I saved my recovery code")}</label>
    <button type="button" className="btn w-full" disabled={!saved} onClick={() => window.location.assign(destination)}>{text("Continue")}</button>
  </div>;
  return <div className="space-y-4">
    <h1 className="text-2xl">{text("Create your Money OS account")}</h1><p className="break-all">{email}</p>
    {taken ? <p role="alert">{text("An account with this email already exists. Sign in using your existing method, then link Google in Settings.")}</p>
      : !signUps ? <p>{text("New accounts are closed on this site.")}</p> : <form method="post" action="/login/google" className="space-y-4" onSubmit={e => { e.preventDefault(); void create(); }}>
        {inviteRequired && <label className="block">{text("Invitation code")}<input className="input mt-1 w-full" type="password" autoComplete="off" maxLength={256} value={inviteCode} onChange={e => setInviteCode(e.target.value)} /></label>}
        <input type="text" aria-hidden="true" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} style={{ position: "absolute", left: -10000, width: 1, height: 1 }} />
        <p className="text-xs"><a href="/terms" target="_blank" rel="noopener">{text("Terms")}</a> · <a href="/privacy" target="_blank" rel="noopener">{text("Privacy")}</a></p>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />{text("I agree to the terms and privacy notice.")}</label>
        {problem && <p role="alert" className="text-[var(--red)]">{text(problem)}</p>}
        <button type="submit" className="btn w-full" disabled={busy || !agreed}>{text(busy ? "Connecting…" : "Create account")}</button>
      </form>}
    <a href="/login" className="btn-secondary block text-center">{text("Back to sign-in")}</a>
  </div>;
}
