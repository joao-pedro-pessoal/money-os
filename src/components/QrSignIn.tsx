"use client";

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
  const { language } = useLanguage();
  const pt = language === "pt";
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

  return <div className="space-y-4">
    <h1 className="text-2xl">{pt ? "Entrar com QR" : "Sign in with QR"}</h1>
    <p>{pt ? "No telemóvel onde já entraste, usa a câmara para ler este QR. Abre a ligação, escreve o número abaixo e aprova." : "Use the camera on your signed-in phone to scan this QR. Open the link, enter the number below and approve."}</p>
    <p className="text-sm text-[var(--muted)]">{pt ? "Os dois aparelhos têm de abrir o mesmo site. A sessão do browser pode ser diferente da sessão da app Android." : "Both devices must open the same site. Your browser may have a different session from the Android app."}</p>
    {status === "waiting" && request && <>
      <canvas ref={canvas} role="img" aria-label={pt ? "QR para aprovar a entrada" : "QR to approve sign-in"} className="mx-auto max-w-full" />
      <p className="text-center text-3xl font-mono tracking-widest" aria-label={pt ? "Número de confirmação" : "Confirmation number"}>{request.code}</p>
      <p role="status" className="text-center">{pt ? `À espera de aprovação — ${seconds}s` : `Waiting for approval — ${seconds}s`}</p>
    </>}
    {status === "expired" && <p role="status">{pt ? "O pedido expirou ou deixou de ser válido. Cria outro QR." : "The request expired or is no longer valid. Create another QR."}</p>}
    {status === "error" && <p role="alert">{pt ? "Não foi possível continuar. Tenta outra vez." : "Could not continue. Please try again."}</p>}
    {status !== "waiting" && <button className="btn w-full" disabled={busy} onClick={() => void start()}>{pt ? "Mostrar novo QR" : "Show new QR"}</button>}
    <button className="btn-secondary w-full" disabled={busy} onClick={async () => {
      setBusy(true);
      try { await cancelQrSignIn(); router.replace(`/login?next=${encodeURIComponent(safeReturnPath(destination))}`); }
      catch { setStatus("error"); setBusy(false); }
    }}>{pt ? "Cancelar e usar palavra-passe" : "Cancel and use password"}</button>
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
  const { language } = useLanguage();
  const pt = language === "pt";
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
  return <div className="space-y-4">
    <h1 className="text-2xl">{pt ? "Aprovar outro aparelho" : "Approve another device"}</h1>
    {!token && <p role="alert">{pt ? "Abre esta página lendo o QR no outro aparelho." : "Open this page by scanning the QR on the other device."}</p>}
    <p>{pt ? "Só aproves um aparelho teu, à tua frente. Nunca aproves um QR enviado por outra pessoa: dá acesso à tua conta e aos teus dados." : "Only approve your own device in front of you. Never approve a QR someone sent you: it grants access to your account and data."}</p>
    {account && <p className="break-all">{pt ? "Conta: " : "Account: "}{account}</p>}
    {status === "sign-in" && <p><a className="btn" href="/login" target="_blank" rel="noopener">{pt ? "Entrar neste browser primeiro" : "Sign in to this browser first"}</a>{pt ? " Depois, volta a ler o QR." : " Then scan the QR again."}</p>}
    {(status === "ready" || status === "invalid") && token && <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); if (busy) return; setBusy(true);
      try { setStatus(await approveQrSignIn(token.id, token.approval, code)); }
      catch { setStatus("error"); }
      finally { setBusy(false); }
    }}>
      <label className="block">{pt ? "Número de 6 dígitos no outro aparelho" : "6-digit number on the other device"}
        <input className="input w-full" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <button className="btn w-full" disabled={busy}>{pt ? "Aprovar entrada" : "Approve sign-in"}</button>
    </form>}
    <p role="status">{status === "approved" ? (pt ? "Aprovado. O outro aparelho vai entrar." : "Approved. The other device will sign in.") : status === "invalid" ? (pt ? "Número incorreto, pedido inválido ou expirado. Depois de 5 tentativas, cria outro QR." : "Wrong number, invalid or expired request. After 5 attempts, create another QR.") : status === "loading" ? (pt ? "A verificar…" : "Checking…") : status === "error" ? (pt ? "Falha de ligação. Volta a abrir o QR." : "Connection failed. Open the QR again.") : ""}</p>
    <Link className="btn-secondary" href="/">{pt ? "Voltar sem aprovar" : "Return without approving"}</Link>
  </div>;
}
