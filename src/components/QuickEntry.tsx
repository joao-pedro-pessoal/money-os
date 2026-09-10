"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createQuickTransaction, undoQuickTransaction } from "@/actions/transactions";
import type { QuickEntryOptions } from "@/lib/money/manualEntry";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function QuickEntry({ accounts, categories, defaultAccountId }: QuickEntryOptions) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const requestId = useRef("");
  const scrollBefore = useRef("");
  const router = useRouter();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const currency = accounts.find(account => account.id === accountId)?.currency;

  useEffect(() => {
    const modal = dialog.current;
    return () => {
      if (modal?.open) document.body.style.overflow = scrollBefore.current;
    };
  }, []);

  function open() {
    if (dialog.current?.open) return;
    form.current?.reset();
    setType("expense");
    setDate(today());
    setError("");
    setSavedId(null);
    setUndone(false);
    if (!accounts.some(account => account.id === accountId)) setAccountId(accounts[0]?.id ?? "");
    requestId.current = `quick-${crypto.randomUUID()}`;
    scrollBefore.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>("#quick-amount")?.focus();
    // After a success the form is remounted by this render.
    requestAnimationFrame(() => {
      if (dialog.current?.open) dialog.current.querySelector<HTMLInputElement>("#quick-amount")?.focus();
    });
  }

  function close() {
    if (!busy.current) {
      document.body.style.overflow = scrollBefore.current;
      dialog.current?.close();
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    data.set("requestId", requestId.current);
    try {
      const result = await createQuickTransaction(data);
      if (result.error) setError(result.error);
      else if (result.id) {
        setSavedId(result.id);
        router.refresh();
      }
    } catch {
      setError("Could not confirm the save. Retry with the same details, or check Cash Flow before starting another entry.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function undo() {
    if (!savedId || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await undoQuickTransaction(savedId);
      setSavedId(null);
      setUndone(true);
      router.refresh();
    } catch {
      setError("Could not confirm the undo. You can retry safely.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className="icon-btn" aria-label="Quick entry" title="Add income or expense" onClick={open}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <dialog ref={dialog} className="quick-entry" aria-labelledby="quick-entry-title"
        onCancel={event => { event.preventDefault(); close(); }}
        onClose={() => { document.body.style.overflow = scrollBefore.current; }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="quick-entry-title" className="text-lg font-semibold">Quick entry</h2>
          <button type="button" className="icon-btn" aria-label="Close quick entry" disabled={pending} onClick={close}>×</button>
        </div>
        {accounts.length === 0 ? (
          <div className="space-y-4">
            <p>Add an account before recording income or expenses.</p>
            <Link href="/accounts" className="btn" onClick={close}>Add an account</Link>
          </div>
        ) : savedId || undone ? (
          <div className="space-y-4">
            <p role="status">{undone ? "Entry undone. The account balance has been restored." : "Entry saved."}</p>
            {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
            <div className="flex gap-3 flex-wrap">
              {savedId && <button type="button" className="btn" disabled={pending} onClick={undo}>{pending ? "Undoing…" : "Undo"}</button>}
              <button type="button" className="btn" disabled={pending} onClick={close}>Done</button>
            </div>
          </div>
        ) : (
          <form ref={form} onSubmit={submit} className="space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Transaction type">
                {(["expense", "income"] as const).map(value => (
                  <button key={value} type="button" aria-pressed={type === value} className="quick-kind" onClick={() => setType(value)}>
                    {value === "expense" ? "Expense" : "Income"}
                  </button>
                ))}
              </div>
              <input type="hidden" name="type" value={type} />
              <label className="block text-sm" htmlFor="quick-amount">Amount{currency ? ` (${currency})` : ""}
                <input id="quick-amount" name="amount" inputMode="decimal" placeholder="0,00" className="input mt-1" required autoFocus autoComplete="off" maxLength={15} />
              </label>
              <div className="text-sm"><label htmlFor="quick-account">Account</label>
                <select id="quick-account" name="accountId" className="input mt-1" required value={accountId} onChange={event => setAccountId(event.target.value)}>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
                </select>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-[var(--muted)] py-2">Details · category, note and date</summary>
                <div className="space-y-3 pt-2">
                  <div className="text-sm"><label htmlFor="quick-category">Category</label>
                    <select key={type} id="quick-category" name="categoryId" className="input mt-1" defaultValue="">
                      <option value="">No category</option>
                      {categories.filter(category => category.kind === type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </div>
                  <label className="block text-sm" htmlFor="quick-description">Description
                    <input id="quick-description" name="description" className="input mt-1" maxLength={500} placeholder="Optional" />
                  </label>
                  <label className="block text-sm" htmlFor="quick-date">Date
                    <input id="quick-date" name="date" type="date" className="input mt-1" required value={date} onChange={event => setDate(event.target.value)} />
                  </label>
                </div>
              </details>
              {error && <p role="alert" className="text-sm text-[var(--red)]">{error}</p>}
              <button type="submit" className="btn w-full">{pending ? "Saving…" : type === "expense" ? "Save expense" : "Save income"}</button>
            </fieldset>
          </form>
        )}
      </dialog>
    </>
  );
}
