"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncConnectionAction } from "@/actions/connections";
import { useLanguage } from "./LanguageContext";
import { useText } from "./useText";
import { readText } from "@/lib/accounts/readText";

export default function SyncConnectionButton({ id }: { id: string }) {
  const uiText = useText();
  const { language } = useLanguage();
  const text = readText(language);
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("id", id);
      const result = await syncConnectionAction(form);
      setMessage(result.ok ? text.synced : "retryAfter" in result && result.retryAfter ? text.limited(result.retryAfter) : text.syncFailed);
      router.refresh();
    } catch { setMessage(text.syncFailed); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" className="btn" onClick={run} disabled={busy} aria-busy={busy}>{uiText(busy ? "Syncing…" : "Sync now")}</button>
    {message && <span role="status" className="text-xs text-[var(--muted)]">{message}</span>}
  </div>;
}
