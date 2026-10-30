"use client";

import { useFormat } from "./useFormat";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { submitAccountBalance } from "@/actions/accounts";
import EditForm from "./EditForm";
import { Money } from "./PrivacyContext";
import { useText } from "./useText";

/**
 * Tapping an account opens this sheet instead of a page: set the balance the
 * bank shows now, or record a single expense or income on it. The details page
 * stays one tap further, for reserved money and history.
 */
export default function AccountQuick({
  account,
  children,
  className,
}: {
  account: { id: string; name: string; currency: string; balance: number };
  children: ReactNode;
  className?: string;
}) {
  const { input } = useFormat();
  const uiText = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const scrollBefore = useRef("");
  const [typed, setTyped] = useState(input(account.balance));
  // Only the types that match the change: a rise is money in or a correction, a fall money out.
  const entered = Number(typed.trim().replace(",", "."));
  const direction = !typed.trim() || !Number.isFinite(entered) || entered === account.balance ? "same" : entered > account.balance ? "up" : "down";
  const types = [
    { value: "correction", label: "Correction (no cash-flow impact)", when: ["same", "up", "down"] },
    { value: "income", label: "Income", when: ["same", "up"] },
    { value: "interest", label: "Interest", when: ["same", "up"] },
    { value: "deposit", label: "Deposit", when: ["same", "up"] },
    { value: "expense", label: "Expense", when: ["same", "down"] },
    { value: "withdrawal", label: "Withdrawal", when: ["same", "down"] },
  ].filter((type) => type.when.includes(direction));

  function open() {
    setTyped(input(account.balance));
    scrollBefore.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
  }
  function close() {
    document.body.style.overflow = scrollBefore.current;
    dialog.current?.close();
  }
  /** Hands over to the quick entry form, already on this account. */
  function entry(kind: "expense" | "income") {
    close();
    window.dispatchEvent(new CustomEvent("money-os:quick-entry", { detail: { kind, accountId: account.id } }));
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>{children}</button>
      <dialog ref={dialog} className="quick-entry" aria-labelledby={`account-quick-${account.id}`}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClose={() => { document.body.style.overflow = scrollBefore.current; }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 id={`account-quick-${account.id}`} className="text-lg font-semibold truncate"><span translate="no">{account.name}</span></h2>
          <button type="button" className="icon-btn" aria-label={uiText("Close")} onClick={close}>×</button>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">{uiText("Balance")}: <Money value={account.balance} currency={account.currency} /></p>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <button type="button" className="btn" onClick={() => entry("expense")}>{uiText("Add expense")}</button>
          <button type="button" className="btn" onClick={() => entry("income")}>{uiText("Add income")}</button>
        </div>

        <h3 className="text-sm font-semibold mb-2">{uiText("Set balance")}</h3>
        <EditForm action={submitAccountBalance} submitLabel="Save balance">
          <input type="hidden" name="accountId" value={account.id} />
          <label className="block text-xs">
            <span className="text-[var(--muted)]">{uiText("What the account really holds now")} ({account.currency})</span>
            <input name="newBalance" inputMode="decimal" autoComplete="off" required className="input mt-1"
              value={typed} onChange={(event) => setTyped(event.target.value)} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <label className="block text-xs">
            <span className="text-[var(--muted)]">{uiText("Record the difference as")}</span>
            <select key={direction} name="classification" className="input mt-1" defaultValue="correction">
              {types.map((type) => <option key={type.value} value={type.value}>{uiText(type.label)}</option>)}
            </select>
          </label>
        </EditForm>

        <Link href={`/accounts/${account.id}`} className="inline-block mt-5 text-sm text-[var(--accent)]" onClick={close}>{uiText("Account details")} →</Link>
      </dialog>
    </>
  );
}
