"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GoogleButton from "./GoogleButton";
import { useLanguage } from "./LanguageContext";
import { googleText } from "@/lib/accounts/googleText";
import { signInKeyFor } from "@/lib/accounts/credentials";
import { passwordProblem } from "@/lib/accounts/password";
import { disconnectGoogle, setGooglePassword } from "@/actions/googleSettings";
import type { GoogleAccountState } from "@/lib/accounts/google";

export default function GoogleMethods({ email, state }: { email: string | null; state: GoogleAccountState }) {
  const { language } = useLanguage(); const text = googleText(language); const router = useRouter();
  const [password, setPassword] = useState(""); const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const pending = useRef(false);
  if (!state.enabled || !email) return null;
  const credential = async () => {
    if (!password) throw new Error("Confirm your current Money OS password first.");
    return signInKeyFor(email, password);
  };
  const save = async (disconnect: boolean) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setProblem(""); setNotice("");
    try {
      if (!disconnect) { const weak = passwordProblem(password); if (weak) throw new Error(weak); }
      const key = await credential();
      const result = disconnect ? await disconnectGoogle({ signInKey: key }) : await setGooglePassword({ signInKey: key });
      if (result.kind !== "ok") throw new Error(result.reason);
      setPassword(""); setNotice(disconnect ? "Google disconnected." : "Password saved."); router.refresh();
    } catch (error) { setProblem(error instanceof Error ? error.message : "Google sign-in failed. Start again."); }
    finally { pending.current = false; setBusy(false); }
  };
  return <div className="space-y-3 border-b border-[var(--border)] pb-3">
    <p className="text-sm">{text(state.linked ? "Google is linked" : "Google is not linked")}{state.email ? ` · ${state.email}` : ""}</p>
    {state.hasPassword ? <>
      <label className="block text-xs">{text("Your Money OS password")}<input type="password" autoComplete="current-password" className="input mt-1" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {state.linked ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save(true)}>{text("Disconnect Google")}</button>
        : <GoogleButton intent="link" credential={credential} destination="/settings" />}
    </> : <>
      {state.confirmation === "set-password" ? <form method="post" action="/settings" className="space-y-2" onSubmit={e => { e.preventDefault(); void save(false); }}>
        <label className="block text-xs">{text("New Money OS password")}<input type="password" autoComplete="new-password" className="input mt-1" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button type="submit" className="btn" disabled={busy}>{text("Save password")}</button>
      </form> : <><p className="text-xs">{text("Set a Money OS password before disconnecting Google.")}</p><GoogleButton intent="confirm" purpose="set-password" destination="/settings" /></>}
    </>}
    {state.confirmation && <p role="status" className="text-xs">{text("Google confirmed. Complete the operation within one minute.")}</p>}
    {problem && <p role="alert" className="text-xs text-[var(--red)]">{text(problem)}</p>}
    {notice && <p role="status" className="text-xs">{text(notice)}</p>}
  </div>;
}
