"use client";

import { useEffect, useRef, useState } from "react";
import { deleteExpected, stopExpected, submitExpectedAddition, submitExpectedArrival, submitExpectedEdit } from "@/actions/expected";
import type { Arrival } from "@/lib/accounting/expected";
import ArrivalFields from "./ArrivalFields";
import ConfirmSubmitButton from "./ConfirmSubmitButton";
import EditForm from "./EditForm";
import { Money } from "./PrivacyContext";
import RetryableForm from "./RetryableForm";
import { useFormat } from "./useFormat";
import { useText } from "./useText";

type Tab = "arrived" | "more" | "edit";

export type ExpectedSheetRow = {
  id: string;
  name: string;
  amount: number;
  extra: number;
  received: number;
  remaining: number;
  currency: string;
  arrival: Arrival;
  anchorDate: string;
  anchorDay: number | null;
  anchorWeekday: number | null;
  accountId: string | null;
  categoryId: string | null;
  notes: string | null;
};

/**
 * Everything that can happen to something still coming, on one sheet: it
 * arrived (all or some), more is coming, or what was said about it changes.
 */
export default function ExpectedSheet({ row, accounts, categories, today }: {
  row: ExpectedSheetRow;
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
  today: string;
}) {
  const uiText = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const scrollBefore = useRef("");
  const [tab, setTab] = useState<Tab>("arrived");

  // Closing the last of it removes this row, and this sheet with it, while it is open.
  useEffect(() => {
    const modal = dialog.current;
    return () => { if (modal?.open) document.body.style.overflow = scrollBefore.current; };
  }, []);

  function open(start: Tab) {
    setTab(start);
    scrollBefore.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
  }
  function close() {
    document.body.style.overflow = scrollBefore.current;
    dialog.current?.close();
  }

  const tabs: [Tab, string][] = [["arrived", "It arrived"], ["more", "Add more"], ["edit", "Edit"]];
  return (
    <>
      <button type="button" className="text-xs text-[var(--accent)]" onClick={() => open("arrived")}>{uiText("Arrived")}</button>
      <button type="button" className="text-xs text-[var(--muted)]" onClick={() => open("edit")}>{uiText("Change it")}</button>
      <dialog ref={dialog} className="quick-entry text-left whitespace-normal" aria-labelledby={`expected-${row.id}`}
        onCancel={(event) => { event.preventDefault(); close(); }}
        onClose={() => { document.body.style.overflow = scrollBefore.current; }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 id={`expected-${row.id}`} className="text-lg font-semibold truncate"><span translate="no">{row.name}</span></h2>
          <button type="button" className="icon-btn" aria-label={uiText("Close")} onClick={close}>×</button>
        </div>
        <p className="text-sm text-[var(--muted)]">{uiText("Still coming")}: <Money value={row.remaining} currency={row.currency} /></p>
        {row.received > 0 && <p className="text-xs text-[var(--muted)]">{uiText("Already arrived")}: <Money value={row.received} currency={row.currency} /></p>}

        <div className="grid grid-cols-3 gap-2 my-4" role="group">
          {tabs.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={tab === value} className="quick-kind text-sm" onClick={() => setTab(value)}>{uiText(label)}</button>
          ))}
        </div>

        {tab === "arrived" && <ArrivedForm row={row} accounts={accounts} today={today} />}
        {tab === "more" && <MoreForm row={row} />}
        {tab === "edit" && <EditFields row={row} accounts={accounts} categories={categories} />}
      </dialog>
    </>
  );
}

function ArrivedForm({ row, accounts, today }: { row: ExpectedSheetRow; accounts: { id: string; name: string; currency: string }[]; today: string }) {
  const uiText = useText();
  const { input } = useFormat();
  const [amount, setAmount] = useState(input(row.remaining));
  const [landing, setLanding] = useState(accounts.some(a => a.id === row.accountId) ? row.accountId! : "");
  const account = accounts.find(a => a.id === landing);
  const typed = Number(amount.trim().replace(",", "."));
  const partial = Number.isFinite(typed) && typed > 0 && typed < row.remaining;
  return (
    <RetryableForm action={submitExpectedArrival}>
      <input type="hidden" name="id" value={row.id} />
      <label className="block text-sm">{uiText("How much arrived")} <span translate="no">({row.currency})</span>
        <input name="amount" inputMode="decimal" className="input mt-1" required autoComplete="off" maxLength={15} value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      {partial && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="closeRest" className="mt-1" />
          <span>{uiText("The rest is not coming")}<span className="block text-xs text-[var(--muted)]">{uiText("Leave this off and the rest stays on the list as still coming.")}</span></span>
        </label>
      )}
      <label className="block text-sm">{uiText("Where it landed")}
        <select name="accountId" className="input mt-1" required value={landing} onChange={e => setLanding(e.target.value)}>
          <option value="" disabled>{uiText("Choose an account")}</option>
          {accounts.map(a => <option translate="no" key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          <option value="none">{uiText("Already recorded: change no balance")}</option>
        </select>
      </label>
      {account && <p className="text-xs text-[var(--muted)]">{uiText("It goes into this account's balance and into Cash Flow as income.")}</p>}
      {account && account.currency !== row.currency && (
        <label className="block text-sm">{uiText("Amount received")} <span translate="no">({account.currency})</span>
          <input name="accountAmount" inputMode="decimal" className="input mt-1" required autoComplete="off" maxLength={15} />
        </label>
      )}
      <label className="block text-sm">{uiText("Date")}
        <input name="date" type="date" className="input mt-1" required defaultValue={today} />
      </label>
      <button type="submit" className="btn w-full">{uiText("Save arrival")}</button>
    </RetryableForm>
  );
}

function MoreForm({ row }: { row: ExpectedSheetRow }) {
  const uiText = useText();
  return (
    <RetryableForm action={submitExpectedAddition}>
      <input type="hidden" name="id" value={row.id} />
      <label className="block text-sm">{uiText("How much more")} <span translate="no">({row.currency})</span>
        <input name="amount" inputMode="decimal" className="input mt-1" required autoComplete="off" maxLength={15} />
      </label>
      <p className="text-xs text-[var(--muted)]">{uiText(row.arrival === "once" ? "It is added to what is still coming." : "Only for the next one. To change all of them, use Edit.")}</p>
      <button type="submit" className="btn w-full">{uiText("Add")}</button>
    </RetryableForm>
  );
}

function EditFields({ row, accounts, categories }: { row: ExpectedSheetRow; accounts: { id: string; name: string; currency: string }[]; categories: { id: string; name: string }[] }) {
  const uiText = useText();
  const { input } = useFormat();
  return (
    <div className="space-y-4">
      <EditForm action={submitExpectedEdit} submitLabel="Save changes">
        <input type="hidden" name="id" value={row.id} />
        <input name="name" className="input" aria-label={uiText("What is it? (e.g. Salary, refund)")} defaultValue={row.name} required />
        <div className="grid grid-cols-2 gap-2">
          <input name="amount" inputMode="decimal" className="input" aria-label={uiText("Amount")} defaultValue={input(row.amount)} required autoComplete="off" maxLength={15} />
          <input name="currency" className="input" aria-label={uiText("Currency")} defaultValue={row.currency} maxLength={3} readOnly={row.received > 0} />
        </div>
        <ArrivalFields defaultArrival={row.arrival} defaultDate={row.anchorDate} defaultDay={row.anchorDay} defaultWeekday={row.anchorWeekday} />
        {accounts.length > 0 && (
          <select name="accountId" className="input" aria-label={uiText("Landing in")} defaultValue={accounts.some(a => a.id === row.accountId) ? row.accountId! : ""}>
            <option value="">{uiText("Landing account — not decided")}</option>
            {accounts.map(a => <option translate="no" key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {categories.length > 0 && (
          <select name="categoryId" className="input" aria-label={uiText("Category")} defaultValue={categories.some(c => c.id === row.categoryId) ? row.categoryId! : ""}>
            <option value="">{uiText("Category — none")}</option>
            {categories.map(c => <option translate="no" key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input name="notes" className="input" placeholder={uiText("Notes")} defaultValue={row.notes ?? ""} />
      </EditForm>
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
        <form action={stopExpected}>
          <input type="hidden" name="id" value={row.id} />
          <button type="submit" className="text-xs text-[var(--muted)] min-h-11">{uiText("Stop expecting this")}</button>
        </form>
        <form action={deleteExpected}>
          <input type="hidden" name="id" value={row.id} />
          <ConfirmSubmitButton label={uiText("Delete")} confirmMessage={uiText('Remove "{0}" entirely? Saying it arrived keeps the record instead.', { "0": row.name })} />
        </form>
      </div>
    </div>
  );
}
