"use client";

import { useState } from "react";
import { balanceChoices, balanceDirection } from "@/lib/money/balanceChoices";
import { useText } from "./useText";

export type BalanceAccount = { id: string; balance: number; currency: string };

/** Shared fields for the account page and quick sheet, using one direction policy. */
export default function AccountBalanceFields({ account, value, onChange }: {
  account: BalanceAccount; value: string; onChange: (value: string) => void;
}) {
  const uiText = useText();
  const direction = balanceDirection(account.balance, value);
  const choices = balanceChoices(direction);
  // Chosen before typing, it must survive the amount: falling back to Correction
  // would quietly record no transaction. It only falls back when it no longer fits.
  const [chosen, setChosen] = useState("correction");
  const classification = choices.some(type => type.value === chosen) ? chosen : "correction";
  return <>
    <input type="hidden" name="accountId" value={account.id} />
    <label className="block text-xs">
      <span className="text-[var(--muted)]">{uiText("What the account really holds now")} ({account.currency})</span>
      <input name="newBalance" inputMode="decimal" autoComplete="off" required className="input mt-1"
        value={value} onChange={event => onChange(event.target.value)} onFocus={event => event.currentTarget.select()} />
    </label>
    <label className="block text-xs">
      <span className="text-[var(--muted)]">{uiText("Record the difference as")}</span>
      <select name="classification" className="input mt-1" value={classification} onChange={event => setChosen(event.target.value)}>
        {choices.map(type => <option key={type.value} value={type.value}>{uiText(type.label)}</option>)}
      </select>
    </label>
  </>;
}
