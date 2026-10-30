"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { gettingStartedProgress } from "@/lib/ui/gettingStarted";
import { useText } from "./useText";

export default function GetStarted({ userId, counts, canRecord }: {
  userId: string;
  counts: { accounts: number; transactions: number; budgets: number; goals: number };
  canRecord: boolean;
}) {
  const t = useText();
  const progress = gettingStartedProgress(counts);
  const key = `moneyos_get_started:${userId}`;
  const [closed, setClosed] = useState(false);
  const read = useCallback(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } }, [key]);
  const subscribe = useCallback((notify: () => void) => {
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) notify(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  const dismissed = useSyncExternalStore(subscribe, read, () => false);
  if (progress.complete || closed || dismissed) return null;

  function dismiss() {
    setClosed(true);
    try { localStorage.setItem(key, "1"); } catch { /* Still closed for this visit. */ }
  }
  function record() {
    window.dispatchEvent(new CustomEvent("money-os:quick-entry", { detail: { kind: "expense" } }));
  }
  const steps = [
    { id:"account", done:progress.account, title:"Add your first account", description:"Enter the balance your account holds today." },
    { id:"transaction", done:progress.transaction, title:"Record your first transaction", description:"Add an income or expense with quick entry." },
    { id:"plan", done:progress.plan, title:"Create a budget or goal", description:"Choose a spending limit or something to save towards." },
  ];
  return <section className="card p-4" data-get-started aria-label={t("Get started")}>
    <div className="flex items-start justify-between gap-3 mb-4">
      <div><h2 className="font-semibold">{t("Get started")}</h2><p className="text-sm text-[var(--muted)] mt-1">{t("Three small steps to make Money OS yours.")}</p></div>
      <button type="button" className="icon-btn shrink-0" onClick={dismiss} aria-label={t("Dismiss getting started")}>×</button>
    </div>
    <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {steps.map((step,index) => <li key={step.id} data-setup-step={step.id} data-complete={step.done} className="min-w-0">
        <div className="flex gap-2 items-start"><span aria-label={step.done?t("Done"):t("Not completed")} className={step.done?"text-[var(--green)]":"text-[var(--muted)]"}>{step.done?"✓":index+1}</span>
          <div>
            {step.id==="account" ? <Link className="text-sm text-[var(--accent)] min-h-11 inline-flex items-center" href="/accounts">{t(step.title)}</Link>
            : step.id==="transaction" ? <button type="button" disabled={!canRecord} onClick={record} className="text-sm text-[var(--accent)] text-left min-h-11 disabled:opacity-50">{t(step.title)}</button>
            : <><p className="text-sm min-h-11 flex items-center">{t(step.title)}</p><div className="flex flex-wrap gap-x-3"><Link href="/budgets" className="text-sm text-[var(--accent)] min-h-11 inline-flex items-center">{t("Create a budget")}</Link><Link href="/buckets" className="text-sm text-[var(--accent)] min-h-11 inline-flex items-center">{t("Create a goal")}</Link></div></>}
            <p className="text-xs text-[var(--muted)]">{t(step.description)}</p>
          </div>
        </div>
      </li>)}
    </ol>
  </section>;
}
