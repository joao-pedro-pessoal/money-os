"use client";

import { useActionState, useRef, useState } from "react";
import { submitTransfer } from "@/actions/transactions";
import { newQuickEntryId } from "@/lib/money/quickEntryId";
import { useText } from "./useText";

type Props = {
  accounts: { id: string; name: string; currency: string }[];
  today: string;
  /** The account it starts from, when one was picked first. */
  initialFromId?: string;
  /** Inside another panel, which already says what this is. */
  bare?: boolean;
};

export default function TransferForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <TransferAttempt key={attempt} {...props} restart={() => setAttempt(n => n + 1)} />;
}

function TransferAttempt({ accounts, today, initialFromId, bare, restart }: Props & { restart: () => void }) {
  const uiText = useText();
  const request = useRef("");
  const [fromId, setFromId] = useState(initialFromId ?? accounts[0]?.id ?? "");
  const otherThan = (id: string) => accounts.find(a => a.id !== id)?.id ?? id;
  const [toId, setToId] = useState(otherThan(fromId));
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const from = accounts.find(a => a.id === fromId);
  const to = accounts.find(a => a.id === toId);
  const crossCurrency = from && to && from.currency !== to.currency;
  const [result, action, pending] = useActionState<{ saved?: boolean; error?: string }, FormData>(async (_, form) => {
    request.current ||= newQuickEntryId();
    form.set("requestId", request.current);
    try { return await submitTransfer(form); }
    catch { return { error: "Connection interrupted. Retry with the same details; a saved transfer will not be duplicated." }; }
  }, {});

  return <div className={bare ? undefined : "card p-4"}>
    {!bare && <div className="text-sm font-medium mb-3">{uiText("Internal transfer")}</div>}
    <p className="text-xs text-[var(--muted)] mb-3">{uiText("Between your own accounts. Does not count as income or spending. For different currencies, enter the two actual amounts.")}</p>
    {/* React resets forms when a client action resolves, including caught errors.
        Preserve the selected accounts for retries; restart remounts after success. */}
    <form action={action} onReset={event => event.preventDefault()} className="space-y-3">
      <fieldset disabled={pending || result.saved} className="space-y-3">
        <label className="block text-xs text-[var(--muted)]">{uiText("From account")}
          <select name="fromAccountId" className="input" required value={fromId} onChange={e => { setFromId(e.target.value); if (e.target.value === toId) { setToId(otherThan(e.target.value)); setReceived(""); } }}>
            {accounts.map(a => <option translate="no" key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        </label>
        <label className="block text-xs text-[var(--muted)]">{uiText("To account")}
          <select name="toAccountId" className="input" required value={toId} onChange={e => { setToId(e.target.value); setReceived(""); }}>
            {accounts.map(a => <option translate="no" key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        </label>
        <label className="block text-xs text-[var(--muted)]">{uiText("Amount sent")} <span translate="no">({from?.currency})</span>
          <input name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" className="input" required value={amount} onChange={e => setAmount(e.target.value)} />
        </label>
        {crossCurrency && <label className="block text-xs text-[var(--muted)]">{uiText("Amount received")} <span translate="no">({to.currency})</span>
          <input name="receivedAmount" type="number" step="0.01" min="0.01" inputMode="decimal" className="input" required value={received} onChange={e => setReceived(e.target.value)} />
        </label>}
        <label className="block text-xs text-[var(--muted)]">{uiText("Date")}
          <input name="date" type="date" className="input" required value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="block text-xs text-[var(--muted)]">{uiText("Description (optional)")}
          <input name="description" className="input" value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <button type="submit" className="btn w-full" disabled={accounts.length < 2}>{pending ? uiText("Saving…") : uiText("Save transfer")}</button>
      </fieldset>
      {result.error && <p role="alert" className="text-xs text-[var(--red)]">{uiText(result.error)}</p>}
      {result.saved && <p role="status" className="text-xs">{uiText("Transfer saved.")}</p>}
      {result.saved && <button type="button" className="btn w-full" onClick={restart}>{uiText("Record another transfer")}</button>}
    </form>
  </div>;
}
