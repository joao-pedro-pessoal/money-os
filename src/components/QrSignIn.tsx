"use client";

import { directionOf } from "@/lib/i18n/languages";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { approveQrSignIn, cancelQrSignIn, consumeQrSignIn, createQrSignIn, qrApprover } from "@/actions/qrSignIn";
import { safeReturnPath } from "@/lib/accounts/returnPath";
import { useLanguage } from "./LanguageContext";

export default function QrSignIn({ approve = false, destination = "/" }: { approve?: boolean; destination?: string }) {
  return approve ? <ApprovalPage /> : <Request destination={destination} />;
}

function Request({ destination }: { destination: string }) {
  const { language, m } = useLanguage();
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [request, setRequest] = useState<Extract<Awaited<ReturnType<typeof createQrSignIn>>, { kind: "created" }> | null>(null);
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(300);

  async function start() {
    setBusy(true);
    try {
      const next = await createQrSignIn();
      if (next.kind === "busy") { setStatus("error"); return; }
      setRequest(next); setSeconds(300); setStatus("waiting");
    } catch { setStatus("error"); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!request || status !== "waiting") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const value = `${location.origin}/login/approve#${request.id}.${request.approval}`;
    void import("qrcode").then((qr) => {
      if (!stopped && canvas.current) return qr.toCanvas(canvas.current, value, { width: 256, margin: 4, errorCorrectionLevel: "M" });
    }).catch(() => { if (!stopped) setStatus("error"); });
    async function poll() {
      try {
        const remaining = Math.max(0, Math.ceil((Date.parse(request!.expiresAt) - Date.now()) / 1000));
        if (!stopped) setSeconds(remaining);
        if (!remaining) { if (!stopped) setStatus("expired"); return; }
        const result = await consumeQrSignIn(request!.id);
        if (stopped) return;
        if (result === "ok") { router.replace(safeReturnPath(destination)); router.refresh(); return; }
        if (result === "expired") { setStatus("expired"); return; }
      } catch { if (!stopped) { setStatus("error"); return; } }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [request, status, destination, router]);

  return <div translate="no" lang={language} dir={directionOf(language)} className="space-y-4">
    <h1 className="text-2xl">{m.qr.title}</h1>
    <p>{m.qr.instructions}</p>
    <p className="text-sm text-[var(--muted)]">{m.qr.sameSite}</p>
    {status === "waiting" && request && <>
      <canvas ref={canvas} role="img" aria-label={m.qr.qrLabel} className="mx-auto max-w-full" />
      <p className="text-center text-3xl font-mono tracking-widest" aria-label={m.qr.numberLabel}>{request.code}</p>
      <p role="status" className="text-center">{`${m.qr.waiting} ${seconds}s`}</p>
    </>}
    {status === "expired" && <p role="status">{m.qr.expired}</p>}
    {status === "error" && <p role="alert">{m.qr.error}</p>}
    {status !== "waiting" && <button className="btn w-full" disabled={busy} onClick={() => void start()}>{m.qr.newQr}</button>}
    <button className="btn-secondary w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await cancelQrSignIn(); router.replace(`/login?next=${encodeURIComponent(safeReturnPath(destination))}`); }
      catch { setStatus("error"); setBusy(false); }
    }}>{m.qr.cancel}</button>
  </div>;
}

const subscribeHash = (changed: () => void) => {
  window.addEventListener("hashchange", changed);
  return () => window.removeEventListener("hashchange", changed);
};
const readHash = () => window.location.hash;
const serverHash = () => "";

function ApprovalPage() {
  const fragment = useSyncExternalStore(subscribeHash, readHash, serverHash);
  // Scanning another QR may be a same-document fragment navigation. Give it
  // fresh consent, account verification and input instead of the last result.
  return <Approve key={fragment} fragment={fragment} />;
}

function Approve({ fragment }: { fragment: string }) {
  const { language, m } = useLanguage();
  const [account, setAccount] = useState<string | null>(null);
  const match = /^#([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(fragment);
  const token = match ? { id: match[1], approval: match[2] } : null;
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    // Keep the capability in the fragment; never put it in a redirect query.
    void qrApprover().then((user) => {
      if (!stopped) { setAccount(user?.email ?? null); setStatus(user ? "ready" : "sign-in"); }
    }).catch(() => { if (!stopped) setStatus("error"); });
    return () => { stopped = true; };
  }, []);
  return <div translate="no" lang={language} dir={directionOf(language)} className="space-y-4">
    <h1 className="text-2xl">{m.qr.approveTitle}</h1>
    {!token && <p role="alert">{m.qr.scanFirst}</p>}
    <p>{m.qr.warning}</p>
    {account && <p className="break-all">{m.qr.account}<bdi translate="no">{account}</bdi></p>}
    {status === "sign-in" && <p><a className="btn" href="/login" target="_blank" rel="noopener">{m.qr.signInFirst}</a>{m.qr.scanAgain}</p>}
    {(status === "ready" || status === "invalid") && token && <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; setBusy(true);
      try { setStatus(await approveQrSignIn(token.id, token.approval, code)); }
      catch { setStatus("error"); }
      finally { setBusy(false); }
    }}>
      <label className="block">{m.qr.sixDigits}
        <input className="input w-full" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <button className="btn w-full" disabled={busy}>{m.qr.approve}</button>
    </form>}
    <p role="status">{status === "approved" ? (m.qr.approved) : status === "invalid" ? (m.qr.invalid) : status === "loading" ? (m.qr.checking) : status === "error" ? (m.qr.connectionFailed) : ""}</p>
    <Link className="btn-secondary" href="/">{m.qr.return}</Link>
  </div>;
}
