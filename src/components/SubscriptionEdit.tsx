"use client";

import { useEffect, useId, useRef, useState } from "react";
import { submitSubscriptionEdit } from "@/actions/subscriptions";
import { CADENCES, type Cadence } from "@/lib/accounting/subscriptions";
import EditForm from "./EditForm";
import { useFormat } from "./useFormat";
import { useText } from "./useText";

type SubscriptionFields = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  cadence: Cadence;
  nextChargeAt: string;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  notes: string | null;
};
type Option = { id: string; name: string };

export default function SubscriptionEdit({ subscription, accounts, categories }: {
  subscription: SubscriptionFields;
  accounts: readonly Option[];
  categories: readonly Option[];
}) {
  const uiText = useText();
  const { input } = useFormat();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const scrollBefore = useRef<string | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => () => {
    if (scrollBefore.current !== null) document.body.style.overflow = scrollBefore.current;
  }, []);

  function open() {
    const modal = dialog.current;
    if (!modal || modal.open) return;
    modal.showModal();
    scrollBefore.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setOpened(true);
  }

  function closed() {
    if (scrollBefore.current !== null) document.body.style.overflow = scrollBefore.current;
    scrollBefore.current = null;
    setOpened(false);
  }

  return (
    <>
      <button
        type="button"
        className="min-h-11 px-2 text-xs text-[var(--accent)] hover:underline"
        aria-haspopup="dialog"
        aria-label={uiText("Edit subscription: {0}", { "0": subscription.name })}
        onClick={open}
      >
        {uiText("Edit")}
      </button>
      <dialog ref={dialog} className="quick-entry text-start whitespace-normal" aria-labelledby={titleId} onClose={closed}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold">
            {uiText("Edit subscription")} · <span translate="no">{subscription.name}</span>
          </h2>
          <button type="button" className="icon-btn shrink-0" aria-label={uiText("Close")} onClick={() => dialog.current?.close()}>×</button>
        </div>
        {opened && (
          <EditForm action={submitSubscriptionEdit} submitLabel="Save changes">
            <input type="hidden" name="id" value={subscription.id} />
            <label className="block text-sm">
              {uiText("Name")}
              <input name="name" className="input mt-1" defaultValue={subscription.name} required />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0 text-sm">
                {uiText("Amount per charge")}
                <input name="amount" inputMode="decimal" autoComplete="off" maxLength={15} className="input mt-1" defaultValue={input(subscription.amount)} required />
              </label>
              <label className="block min-w-0 text-sm">
                {uiText("Currency")}
                <input name="currency" autoCapitalize="characters" autoComplete="off" maxLength={3} className="input mt-1" defaultValue={subscription.currency} required />
              </label>
            </div>
            <label className="block text-sm">
              {uiText("Billing period")}
              <select name="cadence" className="input mt-1" defaultValue={subscription.cadence}>
                {CADENCES.map(({ value, label }) => <option key={value} value={value}>{uiText(label)}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              {uiText("Next charge")}
              <input name="nextChargeAt" type="date" className="input mt-1" defaultValue={subscription.nextChargeAt} />
            </label>
            <label className="block text-sm">
              {uiText("Account")}
              <select name="accountId" className="input mt-1" defaultValue={subscription.accountId ?? ""}>
                <option value="">{uiText("Account — optional")}</option>
                {subscription.accountId && !accounts.some(a => a.id === subscription.accountId) && (
                  <option translate="no" value={subscription.accountId}>
                    {subscription.accountName ?? subscription.accountId} · {uiText("Unavailable")}
                  </option>
                )}
                {accounts.map(({ id, name }) => <option translate="no" key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              {uiText("Category")}
              <select name="categoryId" className="input mt-1" defaultValue={subscription.categoryId ?? ""}>
                <option value="">{uiText("Category — optional")}</option>
                {subscription.categoryId && !categories.some(c => c.id === subscription.categoryId) && (
                  <option translate="no" value={subscription.categoryId}>
                    {subscription.categoryName ?? subscription.categoryId} · {uiText("Unavailable")}
                  </option>
                )}
                {categories.map(({ id, name }) => <option translate="no" key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              {uiText("Notes — optional")}
              <textarea name="notes" rows={2} className="input mt-1" defaultValue={subscription.notes ?? ""} />
            </label>
          </EditForm>
        )}
      </dialog>
    </>
  );
}
