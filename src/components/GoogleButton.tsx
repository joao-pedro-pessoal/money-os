"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLanguage } from "./LanguageContext";
import { googleText } from "@/lib/accounts/googleText";
import type { GooglePurpose } from "@/lib/accounts/google";

type NativeBridge = { postMessage(message: string): void; onmessage?: ((event: { data: string }) => void) | null };
export default function GoogleButton({ intent = "login", purpose, destination = "/", credential, initialError = false }: {
  intent?: "login" | "link" | "confirm"; purpose?: GooglePurpose; destination?: string; credential?: () => Promise<string>; initialError?: boolean;
}) {
  const { language } = useLanguage(); const text = googleText(language);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(initialError ? "Google sign-in failed. Start again." : "");
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(timer.current); }, []);

  const begin = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setProblem("");
    try {
      const bridge = (window as Window & { MoneyOSGoogle?: NativeBridge }).MoneyOSGoogle;
      const inShell = /MoneyOSAndroid\//.test(navigator.userAgent);
      if (inShell && !bridge) throw new Error("Update the Android app to sign in with Google.");
      const nativeMessage = (message: object) => new Promise<Record<string, string>>((resolve, reject) => {
        if (!bridge) return reject(new Error("Google sign-in failed. Start again."));
        bridge.onmessage = event => {
          try {
            const value = JSON.parse(event.data);
            clearTimeout(timer.current); bridge.onmessage = null;
            if (value.kind === "error") reject(new Error("Google sign-in failed. Start again.")); else resolve(value);
          } catch { reject(new Error("Google sign-in failed. Start again.")); }
        };
        timer.current = setTimeout(() => { bridge.onmessage = null; reject(new Error("Google sign-in failed. Start again.")); }, 120000);
        bridge.postMessage(JSON.stringify(message));
      });
      const signInKey = credential ? await credential() : undefined;
      const prepared = bridge ? await nativeMessage({ action: "prepare" }) : null;
      const response = await fetch("/api/auth/google/start", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: bridge ? "native" : "web", intent, purpose, destination, signInKey, ...(prepared ? { challenge: prepared.challenge } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Google sign-in failed. Start again.");
      if (bridge && typeof result.id === "string") await nativeMessage({ action: "sign-in", id: result.id });
      else if (typeof result.url === "string" && new URL(result.url).origin === "https://accounts.google.com") window.location.assign(result.url);
      else throw new Error("Google sign-in failed. Start again.");
    } catch (error) { setProblem(error instanceof Error ? error.message : "Google sign-in failed. Start again."); }
    finally { pending.current = false; setBusy(false); }
  };
  const label = intent === "link" ? "Link Google" : intent === "confirm" ? "Confirm with Google" : "Sign in with Google";
  return <div className="space-y-2">
    <button type="button" className="btn-secondary w-full min-h-11 flex items-center justify-center gap-3" disabled={busy} onClick={() => void begin()}><Image src="/icons/google.svg" alt="" width={20} height={20} />{text(busy ? "Connecting…" : label)}</button>
    {problem && <p role="alert" className="text-sm text-[var(--red)]">{text(problem)}</p>}
  </div>;
}
