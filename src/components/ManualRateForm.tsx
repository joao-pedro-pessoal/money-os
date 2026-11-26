"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitManualRate } from "@/actions/fx";
import { useLanguage } from "./LanguageContext";
import { useText } from "./useText";
import { readText } from "@/lib/accounts/readText";
import { DEFAULT_BASE_CURRENCY } from "@/lib/fx";

export default function ManualRateForm() {
  const uiText = useText();
  const { language } = useLanguage();
  const text = readText(language);
  const router = useRouter();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    pending.current = true; setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await submitManualRate(data);
      setFailed("error" in result);
      setMessage("error" in result ? result.error : text.fxPinned);
      if ("saved" in result) router.refresh();
    } catch { setFailed(true); setMessage(text.fxUnconfirmed); }
    finally { pending.current = false; setBusy(false); }
  }
  return <form onSubmit={save} onChange={() => setMessage("")} className="space-y-2 max-w-md">
    <fieldset disabled={busy} className="flex flex-wrap sm:flex-nowrap gap-2">
      <input name="quote" aria-label={uiText("Currency")} placeholder={uiText("Currency (e.g. USD)")} maxLength={3} className="input min-w-0 w-full sm:w-28" required />
      <input name="rate" aria-label={`${uiText("Per 1 ")}${DEFAULT_BASE_CURRENCY}`} inputMode="decimal" maxLength={21} placeholder={uiText("Units per 1 {0}", { 0: DEFAULT_BASE_CURRENCY })} className="input min-w-0 flex-1" required />
      <button type="submit" className="btn whitespace-nowrap" aria-busy={busy}>{uiText(busy ? "Saving…" : "Pin")}</button>
    </fieldset>
    {message && <p role={failed ? "alert" : "status"} className={`text-xs ${failed ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>{message}</p>}
  </form>;
}
