"use client";

import { useState } from "react";
import { BALANCE_MEANINGS, type BalanceMeaning } from "@/lib/accounting/balanceScope";

/**
 * What an account's balance means, and — for the accounts that are two things
 * at once — where the line between the halves falls.
 *
 * Trade Republic is one account with an IBAN, a card and a securities pocket.
 * Modelling it as two accounts adds up correctly but forces one half to lie
 * about its nature: either the card money is filed as invested, or the ETFs are
 * filed as capital-guaranteed. Neither is true and the dashboard says so out
 * loud, in a number.
 *
 * So the account stays whole and declares its own split. The field below only
 * appears when it's needed, because a question that doesn't apply is a question
 * answered wrongly.
 */
export default function BalanceMeaningField({
  defaultMeaning = "cash_only",
  defaultInvested = null,
  currency = "EUR",
}: {
  defaultMeaning?: BalanceMeaning;
  defaultInvested?: number | null;
  currency?: string;
}) {
  const [meaning, setMeaning] = useState<BalanceMeaning>(defaultMeaning);
  const help = BALANCE_MEANINGS.find((m) => m.value === meaning)?.help ?? "";

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs text-[var(--muted)]">What does that balance mean?</span>
        <select
          name="balanceMeaning"
          className="input mt-1"
          value={meaning}
          onChange={(e) => setMeaning(e.target.value as BalanceMeaning)}
        >
          {BALANCE_MEANINGS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-[var(--muted)] leading-snug">{help}</p>

      {meaning === "bank_and_broker" && (
        <label className="block">
          <span className="text-xs text-[var(--muted)]">
            Of that total, how much is invested? ({currency})
          </span>
          <input
            name="investedValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultInvested ?? ""}
            placeholder="e.g. the value of your ETFs"
            className="input mt-1"
          />
          <span className="text-[10px] text-[var(--muted)] leading-snug block mt-1">
            The rest is treated as spendable cash. Both halves stay in one account, so the total
            never changes — only which side of the guaranteed/at-risk line each part sits on.
          </span>
        </label>
      )}
    </div>
  );
}
