"use client";

import { useText } from "@/components/useText";
import { directionOf } from "@/lib/i18n/languages";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createQuickTransaction, undoQuickTransaction } from "@/actions/transactions";
import type { QuickEntryOptions } from "@/lib/money/manualEntry";
import { newQuickEntryId } from "@/lib/money/quickEntryId";
import PurchaseSavingsFields from './PurchaseSavingsFields';
import TransferForm from './TransferForm';
import { localDay } from "@/lib/calendar/localDay";
import { serverMessageIn } from "@/lib/i18n/messages";
import { useLanguage } from "./LanguageContext";
import { useMobileMode } from "./MobileMode";
import PhoneIcon from "./PhoneIcon";
import { categoryIcon } from "@/lib/ui/phoneIcons";

const today = () => localDay();

type Kind = "expense" | "income" | "transfer";

export default function QuickEntry({ accounts, categories, defaultAccountId }: QuickEntryOptions) {
  const uiText = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const requestId = useRef("");
  const scrollBefore = useRef("");
  const router = useRouter();
  const { m, language } = useLanguage();
  const w = m.quickEntry;
  const [type, setType] = useState<Kind>("expense");
  // On a phone the category is a row of buttons (F30) and this holds the choice.
  const [categoryId, setCategoryId] = useState("");
  const { phone } = useMobileMode();
  // Starts each transfer afresh, from the account it was opened on.
  const [opened, setOpened] = useState(0);
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

  // The Android app's widget, shortcuts and notification open this form
  // directly. They ask by event when the page is already running, and leave the
  // request on `window` when the tap started the page, because then it arrives
  // before this component exists. `?quick=` does the same from a plain link.
  useEffect(() => {
    const kindOf = (value: unknown): Kind | null => (value === "income" || value === "expense" || value === "transfer" ? value : null);
    const pending = window as typeof window & { __moneyOsQuickEntry?: string };
    const fromUrl = new URLSearchParams(window.location.search).get("quick");
    const first = kindOf(pending.__moneyOsQuickEntry) ?? kindOf(fromUrl);
    delete pending.__moneyOsQuickEntry;
    if (fromUrl !== null) {
      const url = new URL(window.location.href);
      url.searchParams.delete("quick");
      window.history.replaceState(window.history.state, "", url);
    }
    if (first) open(first);
    // An account's quick sheet asks with `{ kind, accountId }` to start on that account.
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<string | { kind?: string; accountId?: string }>).detail;
      const kind = kindOf(typeof detail === "object" && detail ? detail.kind : detail);
      delete pending.__moneyOsQuickEntry;
      if (kind) open(kind, typeof detail === "object" && detail ? detail.accountId : undefined);
    };
    window.addEventListener("money-os:quick-entry", handle);
    return () => window.removeEventListener("money-os:quick-entry", handle);
    // Runs once: `open` reads refs and resets state, so the first one is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(kind: Kind = "expense", account?: string) {
    const chosen = account && accounts.some(a => a.id === account) ? account : null;
    if (dialog.current?.open) {
      setType(kind);
      if (chosen) setAccountId(chosen);
      setOpened(n => n + 1);
      return;
    }
    setOpened(n => n + 1);
    form.current?.reset();
    setType(kind);
    setCategoryId("");
    setDate(today());
    setError("");
    setSavedId(null);
    setUndone(false);
    if (chosen) setAccountId(chosen);
    else if (!accounts.some(account => account.id === accountId)) setAccountId(accounts[0]?.id ?? "");
    requestId.current = newQuickEntryId();
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
      if (result.error) setError(serverMessageIn(m, result.error));
      else if (result.id) {
        setSavedId(result.id);
        router.refresh();
      }
    } catch {
      setError(w.saveFailed);
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
      setError(w.undoFailed);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const canTransfer = accounts.length > 1;
  const kinds = (
    <div className={`grid ${canTransfer ? "grid-cols-3" : "grid-cols-2"} gap-2`} role="group" aria-label={w.kind}>
      {(["expense", "income", ...(canTransfer ? ["transfer"] as const : [])] as const).map(value => (
        <button key={value} type="button" aria-pressed={type === value} className="quick-kind" onClick={() => { setType(value); setCategoryId(""); }}>
          {value === "expense" ? w.expense : value === "income" ? w.income : uiText("Transfer")}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button translate="no" lang={language} dir={directionOf(language)} type="button" className="icon-btn quick-entry-trigger" aria-label={w.open} title={w.openTitle} onClick={() => open()}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
        <span className="quick-entry-label"><span className="complex-visible">{w.button}</span><span className="simple-only">{w.button}</span></span>
      </button>
      <dialog translate="no" lang={language} dir={directionOf(language)} ref={dialog} className="quick-entry" aria-labelledby="quick-entry-title"
        onCancel={event => { event.preventDefault(); close(); }}
        onClose={() => { document.body.style.overflow = scrollBefore.current; }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="quick-entry-title" className="text-lg font-semibold">{w.title}</h2>
          <button type="button" className="icon-btn" aria-label={w.close} disabled={pending} onClick={close}>×</button>
        </div>
        {accounts.length === 0 ? (
          <div className="space-y-4">
            <p>{w.noAccounts}</p>
            <Link href="/accounts" className="btn" onClick={close}>{w.addAccount}</Link>
          </div>
        ) : savedId || undone ? (
          <div className="space-y-4">
            <p role="status">{undone ? w.undone : w.saved}</p>
            {error && <p role="alert" className="text-sm text-[var(--red)]">{uiText(error ?? "")}</p>}
            <div className="flex gap-3 flex-wrap">
              {savedId && <Link href="/savings" className="btn" onClick={close}>{w.savingsLink}</Link>}
              {savedId && <button type="button" className="btn" disabled={pending} onClick={undo}>{pending ? w.undoing : w.undo}</button>}
              <button type="button" className="btn" disabled={pending} onClick={close}>{w.done}</button>
            </div>
          </div>
        ) : type === "transfer" ? (
          <div className="space-y-4">
            {kinds}
            <TransferForm key={opened} bare accounts={accounts} today={today()} initialFromId={accountId} />
          </div>
        ) : phone ? (
          /* The phone's form (F30): the amount large, then categories and
             accounts as buttons, so a coffee takes three taps and no list.
             The same fields reach the same action as the form below. */
          <form ref={form} onSubmit={submit} className="space-y-5 ph-entry">
            <fieldset disabled={pending} className="space-y-5">
              {kinds}
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="accountId" value={accountId} />
              <input type="hidden" name="categoryId" value={categoryId} />
              <div className="ph-entry-amount">
                <label htmlFor="quick-amount">{uiText(type === "expense" ? "How much did you spend?" : "How much came in?")}</label>
                <span>
                  <input id="quick-amount" name="amount" inputMode="decimal" placeholder="0,00" required autoFocus autoComplete="off" maxLength={15} />
                  {currency && <span aria-hidden="true">{currency}</span>}
                </span>
              </div>
              {categories.some(category => category.kind === type) && (
                <div role="group" aria-labelledby="quick-category-label">
                  <span id="quick-category-label" className="ph-entry-label">{w.category}</span>
                  <div className="ph-entry-categories">
                    {categories.filter(category => category.kind === type).map(category => (
                      <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(id => id === category.id ? "" : category.id)}>
                        <span><PhoneIcon name={categoryIcon(category.name, type)} size={22} /></span>
                        <span translate="no">{category.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div role="group" aria-labelledby="quick-account-label">
                <span id="quick-account-label" className="ph-entry-label">{w.account}</span>
                <div className="ph-entry-chips">
                  {accounts.map(account => (
                    <button key={account.id} type="button" aria-pressed={accountId === account.id} onClick={() => setAccountId(account.id)}>
                      <span translate="no">{account.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ph-entry-details">
                <label className="ph-entry-date">
                  <span className="sr-only">{w.date}</span>
                  <PhoneIcon name="calendar" size={18} />
                  <input id="quick-date" name="date" type="date" required value={date} onChange={event => setDate(event.target.value)} />
                </label>
                <label className="ph-entry-note">
                  <span className="sr-only">{w.description}</span>
                  <input id="quick-description" name="description" maxLength={500} placeholder={`${w.description} (${w.optional.toLowerCase()})`} />
                </label>
              </div>
              {type === 'expense' && <PurchaseSavingsFields />}
              {error && <p role="alert" className="text-sm text-[var(--red)]">{uiText(error ?? "")}</p>}
              <button type="submit" className="btn w-full ph-entry-save">{pending ? w.saving : type === "expense" ? w.saveExpense : w.saveIncome}</button>
            </fieldset>
          </form>
        ) : (
          <form ref={form} onSubmit={submit} className="space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              {kinds}
              <input type="hidden" name="type" value={type} />
              <label className="block text-sm" htmlFor="quick-amount">{w.amount(currency ?? null)}
                <input id="quick-amount" name="amount" inputMode="decimal" placeholder="0,00" className="input mt-1" required autoFocus autoComplete="off" maxLength={15} />
              </label>
              <div className="text-sm"><label htmlFor="quick-account">{w.account}</label>
                <select id="quick-account" name="accountId" className="input mt-1" required value={accountId} onChange={event => setAccountId(event.target.value)}>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}
                </select>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-[var(--muted)] py-2">{w.details}</summary>
                <div className="space-y-3 pt-2">
                  <div className="text-sm"><label htmlFor="quick-category">{w.category}</label>
                    <select key={type} id="quick-category" name="categoryId" className="input mt-1" defaultValue="">
                      <option value="">{w.noCategory}</option>
                      {categories.filter(category => category.kind === type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </div>
                  <label className="block text-sm" htmlFor="quick-description">{w.description}
                    <input id="quick-description" name="description" className="input mt-1" maxLength={500} placeholder={w.optional} />
                  </label>
                  <label className="block text-sm" htmlFor="quick-date">{w.date}
                    <input id="quick-date" name="date" type="date" className="input mt-1" required value={date} onChange={event => setDate(event.target.value)} />
                  </label>
                </div>
              </details>
              {error && <p role="alert" className="text-sm text-[var(--red)]">{uiText(error ?? "")}</p>}
              {type === 'expense' && <PurchaseSavingsFields />}
              <button type="submit" className="btn w-full">{pending ? w.saving : type === "expense" ? w.saveExpense : w.saveIncome}</button>
            </fieldset>
          </form>
        )}
      </dialog>
    </>
  );
}
