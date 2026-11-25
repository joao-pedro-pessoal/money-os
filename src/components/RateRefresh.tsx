"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshRates, unpinRate } from "@/actions/fx";
import { useLanguage } from "./LanguageContext";
import { useText } from "./useText";
import { readText } from "@/lib/accounts/readText";

export default function RateRefresh({ quote }: { quote?: string }) {
  const router = useRouter();
  const { language } = useLanguage();
  const uiText = useText();
  const text = readText(language);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage(""); setFailed(false);
    try {
      const form = new FormData();
      if (quote) form.set("quote", quote);
      const result = quote ? await unpinRate(form) : await refreshRates();
      setFailed(!result.ok);
      setMessage(result.ok ? (quote ? text.unpinned : text.fxUpdated) : result.error);
      if (result.ok) router.refresh();
    } catch { setFailed(true); setMessage(text.fxUnconfirmed); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" className={quote ? "text-xs text-[var(--accent)] hover:underline" : "btn whitespace-nowrap"} onClick={run} disabled={busy} aria-busy={busy}>{busy ? uiText("Updating…") : uiText(quote ? "Use automatic" : "Refresh now")}</button>
    {message && <span className={`text-xs ${failed ? "text-[var(--red)]" : "text-[var(--muted)]"}`} role={failed ? "alert" : "status"}>{message}</span>}
  </div>;
}
